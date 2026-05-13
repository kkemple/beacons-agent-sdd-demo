import { getSandbox } from "experimental-ash/sandbox";
import { defineTool } from "experimental-ash/tools";
import z from "zod";
import { recordToolEvent } from "../lib/telemetry.js";

const GitHubRepositoryInput = z.object({
  owner: z.string().optional().describe("GitHub repository owner. Defaults to GITHUB_REPOSITORY owner."),
  repo: z.string().optional().describe("GitHub repository name. Defaults to GITHUB_REPOSITORY repo."),
});

function resolveRepository(input: z.infer<typeof GitHubRepositoryInput>) {
  if (input.owner && input.repo) return { owner: input.owner, repo: input.repo };

  const configured = process.env.GITHUB_REPOSITORY;
  if (!configured) throw new Error("Missing repository. Provide owner/repo or set GITHUB_REPOSITORY=owner/repo.");

  const [owner, repo] = configured.split("/");
  if (!owner || !repo) throw new Error("Repository must use owner/repo format.");

  return { owner, repo };
}

export default defineTool({
  description: "Fetch safe metadata for a GitHub repository without exposing secrets.",
  inputSchema: GitHubRepositoryInput,
  async execute(input) {
    const startedAt = Date.now();
    const { owner, repo } = resolveRepository(input);
    recordToolEvent("get_github_repository", "started", { owner, repo });

    const sandbox = await getSandbox();
    recordToolEvent("get_github_repository", "sandbox_ready", { owner, repo });

    const result = await sandbox.runCommand(
      `node -e ${JSON.stringify(`
const { owner, repo } = JSON.parse(process.argv[1]);
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
console.log(JSON.stringify({
  fullName: repository.full_name,
  description: repository.description,
  defaultBranch: repository.default_branch,
  private: repository.private,
  url: repository.html_url,
  openIssuesCount: repository.open_issues_count,
  pushedAt: repository.pushed_at,
}));
`)}` + ` ${JSON.stringify(JSON.stringify({ owner, repo }))}`,
    );
    recordToolEvent("get_github_repository", "github_request_finished", { owner, repo, exitCode: result.exitCode, durationMs: Date.now() - startedAt });

    if (result.exitCode !== 0) {
      recordToolEvent("get_github_repository", "failed", { owner, repo, exitCode: result.exitCode });
      throw new Error(`Sandbox command failed (${result.exitCode}): ${result.stderr || result.stdout}`);
    }

    const output = JSON.parse(result.stdout);
    recordToolEvent("get_github_repository", "completed", { fullName: output.fullName, defaultBranch: output.defaultBranch, durationMs: Date.now() - startedAt });
    return output;
  },
});
