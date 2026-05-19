import { getOctokit } from "../lib/github.js";
import { defineTool } from "experimental-ash/tools";
import { z } from "zod";

const OWNER = "kkemple";
const REPO = "beacons-website-sdd-demo";
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

function searchTerms(query: string) {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9_./-]+/g, " ")
        .split(/\s+/)
        .filter((term) => term.length >= 3)
        .slice(0, 8),
    ),
  );
}

function buildSearchText(query: string) {
  const terms = searchTerms(query);
  return terms.length ? terms.join(" ") : query.trim();
}

export default defineTool({
  description: "Search the demo repository for related issues and pull requests. Use git_clone + grep/read_file for code-level investigation.",
  inputSchema: SearchRepositoryInput,
  async execute(input) {
    const octokit = getOctokit();
    const text = buildSearchText(input.query);
    const state = input.include_closed ? "" : " state:open";
    const scopedTextQuery = `repo:${FULL_REPO} ${text}`;

    const [repository, issuesSearch, prsSearch] = await Promise.all([
      octokit.rest.repos.get({ owner: OWNER, repo: REPO }),
      octokit.rest.search.issuesAndPullRequests({
        q: `${scopedTextQuery} type:issue${state}`,
        per_page: input.max_results,
      }),
      octokit.rest.search.issuesAndPullRequests({
        q: `${scopedTextQuery} type:pr${state}`,
        per_page: input.max_results,
      }),
    ]);

    return {
      repository: {
        name: repository.data.full_name,
        default_branch: repository.data.default_branch,
        url: repository.data.html_url,
      },
      query: input.query,
      normalized_search_text: text,
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
