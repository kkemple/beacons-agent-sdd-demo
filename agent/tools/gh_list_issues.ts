import { getSandbox } from "experimental-ash/sandbox";
import { defineTool } from "experimental-ash/tools";
import z from "zod";

const ListIssuesInput = z.object({
  state: z.enum(["open", "closed", "all"]).default("open").describe("Issue state to filter by"),
  labels: z.string().optional().describe("Comma-separated labels to filter by (e.g., 'bug,high-priority')"),
  assignee: z.string().optional().describe("Filter by assignee username"),
  limit: z.number().default(20).describe("Maximum number of issues to return"),
  repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
});

export default defineTool({
  description: "List GitHub issues with optional filtering",
  inputSchema: ListIssuesInput,
  async execute(input) {
    const startedAt = Date.now();
    console.info("[tool:gh_list_issues] requested", { state: input.state, labels: input.labels ?? null, assignee: input.assignee ?? null, limit: input.limit, repo: input.repo ?? process.env.GITHUB_REPOSITORY ?? null });
    const sandbox = await getSandbox();
    console.info("[tool:gh_list_issues] sandbox acquired");
    const encodedInput = Buffer.from(JSON.stringify(input)).toString("base64");
    const marker = "__ASH_TOOL_RESULT__";
    const result = await sandbox.runCommand(`node <<'ASH_SANDBOX_NODE'
const input = JSON.parse(Buffer.from(${JSON.stringify(encodedInput)}, "base64").toString("utf8"));
const marker = ${JSON.stringify(marker)};
function emit(value) { console.log(marker + JSON.stringify(value)); }
function log(event, data = {}) { console.error("[tool:gh_list_issues] " + event + " " + JSON.stringify(data)); }
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
(async () => {
  const { owner, repo } = parseRepo(input.repo);
  log("repo resolved", { owner, repo });
  const limit = Math.min(input.limit || 20, 100);
  const params = new URLSearchParams({ state: input.state === "all" ? "all" : input.state, per_page: String(limit) });
  if (input.labels) params.set("labels", input.labels);
  if (input.assignee) params.set("assignee", input.assignee);
  log("issues request started", { state: input.state, labels: input.labels ?? null, assignee: input.assignee ?? null, limit });
  const data = await github("/repos/" + owner + "/" + repo + "/issues?" + params.toString());
  log("issues response received", { fetched: data.length });
  const issues = data.filter((issue) => !issue.pull_request).slice(0, input.limit).map((issue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    author: issue.user && issue.user.login,
    labels: (issue.labels || []).map((label) => typeof label === "string" ? label : label.name),
    assignees: (issue.assignees || []).map((assignee) => assignee.login),
    updated_at: issue.updated_at,
  }));
  log("issues filtered", { count: issues.length });
  emit({ total_count: issues.length, issues, filters_applied: { state: input.state, labels: input.labels || null, assignee: input.assignee || null, limit: input.limit } });
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
ASH_SANDBOX_NODE`);

    console.info("[tool:gh_list_issues] sandbox command finished", { exitCode: result.exitCode, durationMs: Date.now() - startedAt });
    if (result.exitCode !== 0) {
      console.error("[tool:gh_list_issues] sandbox command failed", { exitCode: result.exitCode, stderr: result.stderr.slice(0, 2000) });
      throw new Error(`Sandbox command failed (${result.exitCode}): ${result.stderr || result.stdout}`);
    }
    const line = result.stdout.split("\n").reverse().find((entry) => entry.startsWith(marker));
    if (!line) {
      console.error("[tool:gh_list_issues] missing result marker", { stdoutBytes: result.stdout.length, stderrBytes: result.stderr.length });
      throw new Error(`Sandbox command did not return a result: ${result.stdout || result.stderr}`);
    }
    const output = JSON.parse(line.slice(marker.length));
    console.info("[tool:gh_list_issues] completed", { count: output.total_count, durationMs: Date.now() - startedAt });
    return output;
  },
});
