import z from "zod";
import { defineTool } from "experimental-ash/tools";
import { getSandbox } from "experimental-ash/sandbox";
import { recordToolEvent } from "../lib/telemetry.js";

const ListPRsInput = z.object({
  state: z.enum(["open", "closed", "all"]).default("open").describe("PR state to filter by"),
  head: z.string().optional().describe("Filter by head branch name"),
  base: z.string().optional().describe("Filter by base branch name"),
  limit: z.number().default(20).describe("Maximum number of PRs to return"),
  repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
});

export default defineTool({
  description: "List GitHub pull requests with optional filtering",
  inputSchema: ListPRsInput,
  async execute(input) {
    const startedAt = Date.now();
    recordToolEvent("gh_list_prs", "requested", { state: input.state, head: input.head ?? null, base: input.base ?? null, limit: input.limit, repo: input.repo ?? process.env.GITHUB_REPOSITORY ?? null });
    const sandbox = await getSandbox();
    recordToolEvent("gh_list_prs", "sandbox_acquired");
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
const limit = Math.min(input.limit || 20, 100);
const params = new URLSearchParams({ state: input.state === "all" ? "all" : input.state, per_page: String(limit) });
if (input.head) params.set("head", input.head);
if (input.base) params.set("base", input.base);
log("pull requests request started", { state: input.state, head: input.head ?? null, base: input.base ?? null, limit });
const data = await github("/repos/" + owner + "/" + repo + "/pulls?" + params.toString());
log("pull requests response received", { fetched: data.length });
const pull_requests = data.slice(0, input.limit).map((pr) => ({
  number: pr.number,
  title: pr.title,
  state: pr.state,
  author: pr.user && pr.user.login,
  head_branch: pr.head && pr.head.ref,
  base_branch: pr.base && pr.base.ref,
  is_draft: pr.draft,
  updated_at: pr.updated_at,
}));

log("pull requests filtered", { count: pull_requests.length });
emit({
  total_count: pull_requests.length,
  pull_requests,
  filters_applied: {
    state: input.state,
    head_branch: input.head || null,
    base_branch: input.base || null,
    limit: input.limit,
  },
});
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
ASH_SANDBOX_NODE`);

    recordToolEvent("gh_list_prs", "sandbox_command_finished", { exitCode: result.exitCode, durationMs: Date.now() - startedAt });
    if (result.exitCode !== 0) {
      recordToolEvent("gh_list_prs", "sandbox_command_failed", { exitCode: result.exitCode });
      throw new Error(`Sandbox command failed (${result.exitCode}): ${result.stderr || result.stdout}`);
    }
    const line = result.stdout.split("\n").reverse().find((entry) => entry.startsWith(marker));
    if (!line) {
      recordToolEvent("gh_list_prs", "missing_result_marker", { stdoutBytes: result.stdout.length, stderrBytes: result.stderr.length });
      throw new Error(`Sandbox command did not return a result: ${result.stdout || result.stderr}`);
    }
    const output = JSON.parse(line.slice(marker.length));
    recordToolEvent("gh_list_prs", "completed", { count: output.total_count, durationMs: Date.now() - startedAt });
    return output;
  },
});
