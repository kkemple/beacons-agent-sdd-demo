import { getOctokit } from "../lib/github.js";
import { OWNER, REPO } from "../lib/git.js";
import { defineTool } from "experimental-ash/tools";
import { z } from "zod";

const FULL_REPO = `${OWNER}/${REPO}`;

const SearchRepositoryInput = z.object({
  query: z.string().min(1).describe("Triage case text or search query."),
  include_closed: z.boolean().default(true).describe("Include closed issues and pull requests in GitHub search."),
  max_results: z.number().int().min(1).max(10).default(5).describe("Maximum issues and PRs to return per category."),
});

function excerpt(value: string | null | undefined, max = 1200): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

export default defineTool({
  description: "Search the demo repository for related issues and pull requests. Use git_clone + grep/read_file for code-level investigation.",
  inputSchema: SearchRepositoryInput,

  async execute(input) {
    const octokit = getOctokit();
    const state = input.include_closed ? "" : " state:open";
    const base = `repo:${FULL_REPO} ${input.query}`;

    const [issuesSearch, prsSearch] = await Promise.all([
      octokit.rest.search.issuesAndPullRequests({
        q: `${base} type:issue${state}`,
        per_page: input.max_results,
      }),
      octokit.rest.search.issuesAndPullRequests({
        q: `${base} type:pr${state}`,
        per_page: input.max_results,
      }),
    ]);

    return {
      related_issues: issuesSearch.data.items.map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        url: issue.html_url,
        labels: issue.labels.map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean),
        author: issue.user?.login,
        updated_at: issue.updated_at,
        body_excerpt: excerpt(issue.body),
      })),
      related_prs: prsSearch.data.items.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        url: pr.html_url,
        labels: pr.labels.map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean),
        author: pr.user?.login,
        updated_at: pr.updated_at,
        body_excerpt: excerpt(pr.body),
      })),
    };
  },
});
