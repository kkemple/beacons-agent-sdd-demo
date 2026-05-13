import z from "zod";
import { defineTool } from "experimental-ash/tools";
import { getSandbox } from "experimental-ash/sandbox";
import { recordToolEvent } from "../lib/telemetry.js";

const GetPRInput = z.object({
  pr_number: z.number().describe("GitHub pull request number to fetch"),
  include_comments: z.boolean().default(false).describe("Include PR comments in the response"),
  repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
});

export default defineTool({
  description: "Fetch GitHub pull request details for case investigation",
  inputSchema: GetPRInput,
  async execute(input) {
    const startedAt = Date.now();
    recordToolEvent("gh_get_pr", "requested", { pr: input.pr_number, includeComments: input.include_comments, repo: input.repo ?? process.env.GITHUB_REPOSITORY ?? null });
    const sandbox = await getSandbox();
    recordToolEvent("gh_get_pr", "sandbox_acquired");
    const encodedInput = Buffer.from(JSON.stringify(input)).toString("base64");
    const marker = "__ASH_TOOL_RESULT__";
    const result = await sandbox.runCommand(`node <<'ASH_SANDBOX_NODE'
const input = JSON.parse(Buffer.from(${JSON.stringify(encodedInput)}, "base64").toString("utf8"));
const marker = ${JSON.stringify(marker)};
function emit(value) { console.log(marker + JSON.stringify(value)); }
function log(_event, _data = {}) {}
(async () => {
function parseRepo(repo) {
  const value = repo || process.env.GITHUB_REPOSITORY || "";
  const [owner, name] = value.split("/");
  if (!owner || !name) throw new Error('Invalid or missing repo: "' + value + '". Provide owner/repo or set GITHUB_REPOSITORY.');
  return { owner, repo: name };
}

async function github(path) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  const response = await fetch("https://api.github.com" + path, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "User-Agent": "ash-casey-code-remediation-demo",
      "X-GitHub-Api-Version": "2022-11-28",
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
log("pull request request started", { pr: input.pr_number });
const pr = await github("/repos/" + owner + "/" + repo + "/pulls/" + input.pr_number);
log("pull request received", { pr: pr.number, state: pr.state, head: pr.head && pr.head.ref, base: pr.base && pr.base.ref });
let comments;
if (input.include_comments) {
  log("comments request started", { pr: input.pr_number, perPage: 50 });
  comments = await github("/repos/" + owner + "/" + repo + "/issues/" + input.pr_number + "/comments?per_page=50");
  log("comments received", { count: comments.length });
}

emit({
  number: pr.number,
  title: pr.title,
  body: pr.body,
  state: pr.state,
  author: pr.user && pr.user.login,
  labels: (pr.labels || []).map((label) => typeof label === "string" ? label : label.name),
  head_branch: pr.head && pr.head.ref,
  base_branch: pr.base && pr.base.ref,
  is_draft: pr.draft,
  mergeable: pr.mergeable,
  additions: pr.additions,
  deletions: pr.deletions,
  changed_files: pr.changed_files,
  created_at: pr.created_at,
  updated_at: pr.updated_at,
  ...(comments ? {
    comments: comments.map((comment) => ({
      author: comment.user && comment.user.login,
      body: comment.body,
      created_at: comment.created_at,
    })),
  } : {}),
});
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
ASH_SANDBOX_NODE`);

    recordToolEvent("gh_get_pr", "sandbox_command_finished", { exitCode: result.exitCode, durationMs: Date.now() - startedAt });
    if (result.exitCode !== 0) {
      recordToolEvent("gh_get_pr", "sandbox_command_failed", { exitCode: result.exitCode });
      throw new Error(`Sandbox command failed (${result.exitCode}): ${result.stderr || result.stdout}`);
    }
    const line = result.stdout.split("\n").reverse().find((entry) => entry.startsWith(marker));
    if (!line) {
      recordToolEvent("gh_get_pr", "missing_result_marker", { stdoutBytes: result.stdout.length, stderrBytes: result.stderr.length });
      throw new Error(`Sandbox command did not return a result: ${result.stdout || result.stderr}`);
    }
    const output = JSON.parse(line.slice(marker.length));
    recordToolEvent("gh_get_pr", "completed", { pr: output.number, state: output.state, head: output.head_branch, base: output.base_branch, durationMs: Date.now() - startedAt });
    return output;
  },
});
