import { defineTool } from "experimental-ash/tools";
import z from "zod";

import { getOctokit, parseRepo } from "../lib/github.js";

const GitHubRepositoryInput = z.object({
  owner: z.string().optional().describe("GitHub repository owner. Defaults to GITHUB_REPOSITORY owner."),
  repo: z.string().optional().describe("GitHub repository name. Defaults to GITHUB_REPOSITORY repo."),
});

function resolveRepository(input: z.infer<typeof GitHubRepositoryInput>) {
  if (input.owner && input.repo) {
    return { owner: input.owner, repo: input.repo };
  }

  if (process.env.GITHUB_REPOSITORY) {
    return parseRepo(process.env.GITHUB_REPOSITORY);
  }

  throw new Error("Repository must be provided via owner/repo or GITHUB_REPOSITORY.");
}

export default defineTool({
  description: "Fetch safe metadata for a GitHub repository without exposing secrets.",
  inputSchema: GitHubRepositoryInput,
  async execute(input) {
    const octokit = getOctokit();
    const { owner, repo } = resolveRepository(input);

    const { data: repository } = await octokit.rest.repos.get({ owner, repo });

    const output = {
      fullName: repository.full_name,
      description: repository.description,
      defaultBranch: repository.default_branch,
      private: repository.private,
      url: repository.html_url,
      openIssuesCount: repository.open_issues_count,
      pushedAt: repository.pushed_at,
    };
    return output;
  },
});
