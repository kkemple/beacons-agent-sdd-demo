import { getSandbox } from "experimental-ash/sandbox";
import { defineTool } from "experimental-ash/tools";
import z from "zod";

const GetIssueInput = z.object({
  issue_number: z.number().describe("GitHub issue number to fetch"),
  repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
});

export default defineTool({
  description: "Fetch GitHub issue details for a case investigation",
  inputSchema: GetIssueInput,
  async execute(input) {
    const startedAt = Date.now();
    console.info("[tool:gh_get_issue] requested", { issue: input.issue_number, repo: input.repo ?? process.env.GITHUB_REPOSITORY ?? null });
    const sandbox = await getSandbox();
    console.info("[tool:gh_get_issue] sandbox acquired");
    const encodedInput = Buffer.from(JSON.stringify(input)).toString("base64");
    const marker = "__ASH_TOOL_RESULT__";
    const result = await sandbox.runCommand(`node <<'ASH_SANDBOX_NODE'
const input = JSON.parse(Buffer.from(${JSON.stringify(encodedInput)}, "base64").toString("utf8"));
const marker = ${JSON.stringify(marker)};
function emit(value) { console.log(marker + JSON.stringify(value)); }
function log(event, data = {}) { console.error("[tool:gh_get_issue] " + event + " " + JSON.stringify(data)); }
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
  log("issue request started", { issue: input.issue_number });
  const issue = await github("/repos/" + owner + "/" + repo + "/issues/" + input.issue_number);
  log("issue received", { issue: issue.number, state: issue.state, comments: issue.comments });
  log("comments request started", { issue: input.issue_number, perPage: 50 });
  const comments = await github("/repos/" + owner + "/" + repo + "/issues/" + input.issue_number + "/comments?per_page=50");
  log("comments received", { count: comments.length });
  emit({
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    author: issue.user && issue.user.login,
    labels: (issue.labels || []).map((label) => typeof label === "string" ? label : label.name),
    comment_count: issue.comments,
    comments: comments.map((comment) => ({ author: comment.user && comment.user.login, body: comment.body, created_at: comment.created_at })),
  });
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
ASH_SANDBOX_NODE`);

    console.info("[tool:gh_get_issue] sandbox command finished", { exitCode: result.exitCode, durationMs: Date.now() - startedAt });
    if (result.exitCode !== 0) {
      console.error("[tool:gh_get_issue] sandbox command failed", { exitCode: result.exitCode, stderr: result.stderr.slice(0, 2000) });
      throw new Error(`Sandbox command failed (${result.exitCode}): ${result.stderr || result.stdout}`);
    }
    const line = result.stdout.split("\n").reverse().find((entry) => entry.startsWith(marker));
    if (!line) {
      console.error("[tool:gh_get_issue] missing result marker", { stdoutBytes: result.stdout.length, stderrBytes: result.stderr.length });
      throw new Error(`Sandbox command did not return a result: ${result.stdout || result.stderr}`);
    }
    const output = JSON.parse(line.slice(marker.length));
    console.info("[tool:gh_get_issue] completed", { issue: output.number, state: output.state, comments: output.comments.length, durationMs: Date.now() - startedAt });
    return output;
  },
});
