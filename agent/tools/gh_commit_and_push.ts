import { getSandbox } from "experimental-ash/sandbox";
import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { recordToolEvent } from "../lib/telemetry.js";

const FileChange = z.object({
  path: z.string().describe("File path in the repository"),
  content: z.string().describe("Full file content to write"),
});

export default defineTool({
  description: "Commit one or more file changes to a branch. Requires approval before execution.",
  inputSchema: z.object({
    branch: z.string().describe("Branch to commit to"),
    message: z.string().describe("Commit message"),
    files: z.array(FileChange).min(1).describe("Files to create or update"),
    repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
  }),
  // needsApproval: always(),
  async execute(input) {
    const startedAt = Date.now();
    recordToolEvent("gh_commit_and_push", "requested", { branch: input.branch, message: input.message, fileCount: input.files.length, files: input.files.map((file) => file.path), repo: input.repo ?? process.env.GITHUB_REPOSITORY ?? null });
    const sandbox = await getSandbox();
    recordToolEvent("gh_commit_and_push", "sandbox_acquired");
    const encodedInput = Buffer.from(JSON.stringify(input)).toString("base64");
    const marker = "__ASH_TOOL_RESULT__";
    const result = await sandbox.runCommand(`node <<'ASH_SANDBOX_NODE'
const input = JSON.parse(Buffer.from(${JSON.stringify(encodedInput)}, "base64").toString("utf8"));
const marker = ${JSON.stringify(marker)};
function emit(value) { console.log(marker + JSON.stringify(value)); }
function log(_event, _data = {}) {}
function parseRepo(repo) {
  const value = repo || process.env.GITHUB_REPOSITORY || "";
  const [owner, name] = value.split("/");
  if (!owner || !name) throw new Error('Invalid or missing repo: "' + value + '". Provide owner/repo or set GITHUB_REPOSITORY.');
  return { owner, repo: name };
}
async function github(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  const response = await fetch("https://api.github.com" + path, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "User-Agent": "ash-casey-code-remediation-demo",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error("GitHub request failed: " + response.status + " " + response.statusText + " " + body.slice(0, 300));
  }
  return response.json();
}
(async () => {
  const { owner, repo } = parseRepo(input.repo);
  log("repo resolved", { owner, repo });
  log("branch ref lookup started", { branch: input.branch });
  const ref = await github("/repos/" + owner + "/" + repo + "/git/ref/heads/" + encodeURIComponent(input.branch).replace(/%2F/g, "/"));
  const latestCommitSha = ref.object.sha;
  log("branch ref resolved", { branch: input.branch, sha: latestCommitSha });
  log("base commit lookup started", { sha: latestCommitSha });
  const commit = await github("/repos/" + owner + "/" + repo + "/git/commits/" + latestCommitSha);
  log("base tree resolved", { treeSha: commit.tree.sha });
  const treeItems = await Promise.all(input.files.map(async (file) => {
    log("blob create started", { path: file.path, bytes: Buffer.byteLength(file.content, "utf8") });
    const blob = await github("/repos/" + owner + "/" + repo + "/git/blobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: Buffer.from(file.content).toString("base64"), encoding: "base64" }),
    });
    log("blob created", { path: file.path, sha: blob.sha });
    return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
  }));
  log("tree create started", { baseTree: commit.tree.sha, itemCount: treeItems.length });
  const tree = await github("/repos/" + owner + "/" + repo + "/git/trees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: commit.tree.sha, tree: treeItems }),
  });
  log("tree created", { treeSha: tree.sha });
  log("commit create started", { parent: latestCommitSha, tree: tree.sha, message: input.message });
  const newCommit = await github("/repos/" + owner + "/" + repo + "/git/commits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: input.message, tree: tree.sha, parents: [latestCommitSha] }),
  });
  log("commit created", { sha: newCommit.sha });
  log("branch update started", { branch: input.branch, sha: newCommit.sha });
  await github("/repos/" + owner + "/" + repo + "/git/refs/heads/" + encodeURIComponent(input.branch).replace(/%2F/g, "/"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: newCommit.sha }),
  });
  log("branch updated", { branch: input.branch, sha: newCommit.sha });
  emit({ branch: input.branch, message: input.message, sha: newCommit.sha, files: input.files.map((file) => file.path), url: "https://github.com/" + owner + "/" + repo + "/tree/" + input.branch });
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
ASH_SANDBOX_NODE`);

    recordToolEvent("gh_commit_and_push", "sandbox_command_finished", { exitCode: result.exitCode, durationMs: Date.now() - startedAt });
    if (result.exitCode !== 0) {
      recordToolEvent("gh_commit_and_push", "sandbox_command_failed", { exitCode: result.exitCode });
      throw new Error(`Sandbox command failed (${result.exitCode}): ${result.stderr || result.stdout}`);
    }
    const line = result.stdout.split("\n").reverse().find((entry) => entry.startsWith(marker));
    if (!line) {
      recordToolEvent("gh_commit_and_push", "missing_result_marker", { stdoutBytes: result.stdout.length, stderrBytes: result.stderr.length });
      throw new Error(`Sandbox command did not return a result: ${result.stdout || result.stderr}`);
    }
    const output = JSON.parse(line.slice(marker.length));
    recordToolEvent("gh_commit_and_push", "completed", { branch: output.branch, sha: output.sha, files: output.files, durationMs: Date.now() - startedAt });
    return output;
  },
});
