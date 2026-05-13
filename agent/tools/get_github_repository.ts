import { getSandbox } from "experimental-ash/sandbox";
import { defineTool } from "experimental-ash/tools";
import z from "zod";

const GitHubRepositoryInput = z.object({
  owner: z.string().optional().describe("GitHub repository owner. Defaults to GITHUB_REPOSITORY owner."),
  repo: z.string().optional().describe("GitHub repository name. Defaults to GITHUB_REPOSITORY repo."),
});

export default defineTool({
  description: "Fetch safe metadata for a GitHub repository without exposing secrets.",
  inputSchema: GitHubRepositoryInput,
  async execute(input) {
    const sandbox = await getSandbox();
    const encodedInput = Buffer.from(JSON.stringify(input)).toString("base64");
    const marker = "__ASH_TOOL_RESULT__";
    const result = await sandbox.runCommand(`node <<'ASH_SANDBOX_NODE'
const input = JSON.parse(Buffer.from(${JSON.stringify(encodedInput)}, "base64").toString("utf8"));
const marker = ${JSON.stringify(marker)};
function emit(value) { console.log(marker + JSON.stringify(value)); }
(async () => {
  let owner = input.owner;
  let repo = input.repo;

  if (!owner || !repo) {
    const configured = process.env.GITHUB_REPOSITORY;
    if (!configured) throw new Error("Missing repository. Provide owner/repo or set GITHUB_REPOSITORY=owner/repo.");
    [owner, repo] = configured.split("/");
  }

  if (!owner || !repo) throw new Error("Repository must use owner/repo format.");

  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Missing GITHUB_TOKEN.");

  const response = await fetch("https://api.github.com/repos/" + owner + "/" + repo, {
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

  const repository = await response.json();
  emit({
    fullName: repository.full_name,
    description: repository.description,
    defaultBranch: repository.default_branch,
    private: repository.private,
    url: repository.html_url,
    openIssuesCount: repository.open_issues_count,
    pushedAt: repository.pushed_at,
  });
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
ASH_SANDBOX_NODE`);

    if (result.exitCode !== 0) throw new Error(`Sandbox command failed (${result.exitCode}): ${result.stderr || result.stdout}`);
    const line = result.stdout.split("\n").reverse().find((entry) => entry.startsWith(marker));
    if (!line) throw new Error(`Sandbox command did not return a result: ${result.stdout || result.stderr}`);
    return JSON.parse(line.slice(marker.length));
  },
});
