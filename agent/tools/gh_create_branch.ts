import { getSandbox } from "experimental-ash/sandbox";
import { defineTool } from "experimental-ash/tools";
import z from "zod";
import { recordToolEvent } from "../lib/telemetry.js";

export default defineTool({
  description: "Create a new branch for code remediation work. Requires approval before execution.",
  inputSchema: z.object({
    branch_name: z.string().describe("New branch name, preferably case-<issue>-short-summary format"),
    base_branch: z.string().optional().describe("Base branch to create from. Defaults to the repository default branch."),
    repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
  }),
  async execute(input) {
    const startedAt = Date.now();
    recordToolEvent("gh_create_branch", "requested", { branch: input.branch_name, baseBranch: input.base_branch ?? "default", repo: input.repo ?? process.env.GITHUB_REPOSITORY ?? null });
    const sandbox = await getSandbox();
    recordToolEvent("gh_create_branch", "sandbox_acquired");
    const encodedInput = Buffer.from(JSON.stringify(input)).toString("base64");
    const marker = "__ASH_TOOL_RESULT__";
    const result = await sandbox.runCommand(`node <<'ASH_SANDBOX_NODE'
const input = JSON.parse(Buffer.from(${JSON.stringify(encodedInput)}, "base64").toString("utf8"));
const marker = ${JSON.stringify(marker)};
function emit(value) { console.log(marker + JSON.stringify(value)); }
function log(event, data = {}) { console.error("[tool:gh_create_branch] " + event + " " + JSON.stringify(data)); }
(async () => {
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

const { owner, repo } = parseRepo(input.repo);
log("repo resolved", { owner, repo });
let baseBranch = input.base_branch;
if (!baseBranch) {
  log("default branch lookup started");
  const repository = await github("/repos/" + owner + "/" + repo);
  baseBranch = repository.default_branch;
  log("default branch resolved", { baseBranch });
} else {
  log("base branch supplied", { baseBranch });
}

log("base ref lookup started", { baseBranch });
const ref = await github("/repos/" + owner + "/" + repo + "/git/ref/heads/" + encodeURIComponent(baseBranch).replace(/%2F/g, "/"));
log("base ref resolved", { baseBranch, sha: ref.object.sha });
log("create ref started", { branch: input.branch_name, sha: ref.object.sha });
const newRef = await github("/repos/" + owner + "/" + repo + "/git/refs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ref: "refs/heads/" + input.branch_name, sha: ref.object.sha }),
});

log("create ref completed", { branch: input.branch_name, sha: newRef.object.sha });
emit({
  branch: input.branch_name,
  sha: newRef.object.sha,
  url: "https://github.com/" + owner + "/" + repo + "/tree/" + input.branch_name,
});
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
ASH_SANDBOX_NODE`);

    recordToolEvent("gh_create_branch", "sandbox_command_finished", { exitCode: result.exitCode, durationMs: Date.now() - startedAt });
    if (result.exitCode !== 0) {
      recordToolEvent("gh_create_branch", "sandbox_command_failed", { exitCode: result.exitCode });
      throw new Error(`Sandbox command failed (${result.exitCode}): ${result.stderr || result.stdout}`);
    }
    const line = result.stdout.split("\n").reverse().find((entry) => entry.startsWith(marker));
    if (!line) {
      recordToolEvent("gh_create_branch", "missing_result_marker", { stdoutBytes: result.stdout.length, stderrBytes: result.stderr.length });
      throw new Error(`Sandbox command did not return a result: ${result.stdout || result.stderr}`);
    }
    const output = JSON.parse(line.slice(marker.length));
    recordToolEvent("gh_create_branch", "completed", { branch: output.branch, sha: output.sha, durationMs: Date.now() - startedAt });
    return output;
  },
});
