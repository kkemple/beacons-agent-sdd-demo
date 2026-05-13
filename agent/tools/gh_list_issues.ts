import { defineTool } from "experimental-ash/tools";
import z from "zod";

import { getOctokit, parseRepo } from "../lib/github.js";


const ListIssuesInput = z.object({
  state: z.enum(["open", "closed", "all"]).default("open").describe("Issue state to filter by"),
  labels: z.string().optional().describe("Comma-separated labels to filter by (e.g., 'bug,high-priority')"),
  assignee: z.string().optional().describe("Filter by assignee username"),
  limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of issues to return (1-100)"),
  repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
});

export default defineTool({
  description: "List GitHub issues with optional filtering",
  inputSchema: ListIssuesInput,
  async execute(input) {
    const startedAt = Date.now();
    const octokit = getOctokit();


    const { owner, repo } = parseRepo(input.repo);


    const issues: Array<{ number: number; title: string; state: string; author?: string; labels: Array<string | undefined>; assignees: string[]; updated_at: string }> = [];
    let page = 1;

    while (issues.length < input.limit) {
      const { data } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: input.state,
        labels: input.labels,
        assignee: input.assignee,
        per_page: Math.min(100, input.limit),
        page,
      });

      if (data.length === 0) break;

      const pageIssues = data
        .filter((issue) => !issue.pull_request)
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          author: issue.user?.login,
          labels: issue.labels.map((label) => typeof label === "string" ? label : label.name),
          assignees: issue.assignees?.map((assignee) => assignee.login) ?? [],
          updated_at: issue.updated_at,
        }));

      issues.push(...pageIssues);
      if (data.length < Math.min(100, input.limit)) break;
      page += 1;
    }



    const limitedIssues = issues.slice(0, input.limit);
    const output = { total_count: limitedIssues.length, issues: limitedIssues, filters_applied: { state: input.state, labels: input.labels || null, assignee: input.assignee || null, limit: input.limit } };


    return output;
  },
});
