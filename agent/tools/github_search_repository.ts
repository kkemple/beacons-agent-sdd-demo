import type { Octokit } from "@octokit/rest";
import { getOctokit } from "../lib/github.js";
import { defineTool } from "experimental-ash/tools";
import { z } from "zod";

const OWNER = "kkemple";
const REPO = "beacons-website-sdd-demo";
const FULL_REPO = `${OWNER}/${REPO}`;

const SearchRepositoryInput = z.object({
  query: z.string().min(1).describe("Triage case text or search query."),
  include_closed: z.boolean().default(true).describe("Include closed issues and pull requests in GitHub search."),
  max_results: z.number().int().min(1).max(10).default(5).describe("Maximum issues, PRs, and code matches to return per category."),
});

type CodeSearchItem = Awaited<ReturnType<Octokit["rest"]["search"]["code"]>>["data"]["items"][number];

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

function decodeBase64(content: string) {
  return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
}

function fileSnippet(content: string, terms: string[], maxLines = 8) {
  const lines = content.split(/\r?\n/);
  const lowerTerms = terms.map((term) => term.toLowerCase());
  const matchIndex = lines.findIndex((line) =>
    lowerTerms.some((term) => line.toLowerCase().includes(term)),
  );

  if (matchIndex === -1) {
    return lines.slice(0, maxLines).join("\n").slice(0, 1600);
  }

  const start = Math.max(0, matchIndex - 3);
  const end = Math.min(lines.length, matchIndex + 4);
  return lines
    .slice(start, end)
    .map((line, index) => `${start + index + 1}: ${line}`)
    .join("\n")
    .slice(0, 1600);
}

async function getFileContext(octokit: Octokit, item: CodeSearchItem, terms: string[]) {
  try {
    const response = await octokit.rest.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: item.path,
      ref: item.sha,
    });

    if (Array.isArray(response.data) || response.data.type !== "file" || !response.data.content) {
      return undefined;
    }

    return fileSnippet(decodeBase64(response.data.content), terms);
  } catch (error) {
    return `Unable to fetch file excerpt: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export default defineTool({
  description: "Search the demo repository with Octokit only. Returns related issues, pull requests, code matches, and compact file excerpts.",
  inputSchema: SearchRepositoryInput,
  async execute(input) {
    const octokit = getOctokit();
    const text = buildSearchText(input.query);
    const terms = searchTerms(input.query);
    const state = input.include_closed ? "" : " state:open";
    const scopedTextQuery = `repo:${FULL_REPO} ${text}`;

    const [repository, issuesSearch, prsSearch, codeSearch] = await Promise.all([
      octokit.rest.repos.get({ owner: OWNER, repo: REPO }),
      octokit.rest.search.issuesAndPullRequests({
        q: `${scopedTextQuery} type:issue${state}`,
        per_page: input.max_results,
      }),
      octokit.rest.search.issuesAndPullRequests({
        q: `${scopedTextQuery} type:pr${state}`,
        per_page: input.max_results,
      }),
      octokit.rest.search
        .code({
          q: scopedTextQuery,
          per_page: input.max_results,
        })
        .catch((error: unknown) => ({
          data: { items: [], incomplete_results: true },
          error: error instanceof Error ? error.message : String(error),
        })),
    ]);

    const codeMatches = await Promise.all(
      codeSearch.data.items.map(async (item) => ({
        path: item.path,
        name: item.name,
        url: item.html_url,
        score: item.score,
        excerpt: await getFileContext(octokit, item, terms),
      })),
    );

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
      code_matches: codeMatches,
      code_search_incomplete: codeSearch.data.incomplete_results,
      code_search_error: "error" in codeSearch ? codeSearch.error : undefined,
    };
  },
});
