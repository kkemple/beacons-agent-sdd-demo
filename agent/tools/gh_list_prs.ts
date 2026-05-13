import { defineTool } from "experimental-ash/tools";
import z from "zod";

import { getOctokit, parseRepo } from "../lib/github.js";


const ListPRsInput = z.object({
  state: z.enum(["open", "closed", "all"]).default("open").describe("PR state to filter by"),
  head: z.string().optional().describe("Filter by head branch name"),
  base: z.string().optional().describe("Filter by base branch name"),
  limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of PRs to return (1-100)"),
  repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
});

export default defineTool({
  description: "List GitHub pull requests with optional filtering",
  inputSchema: ListPRsInput,
  async execute(input) {
    const octokit = getOctokit();
    const startedAt = Date.now();


    const { owner, repo } = parseRepo(input.repo);



    const limit = input.limit;
    const { data } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: input.state,
      head: input.head,
      base: input.base,
      per_page: limit,
    });



    const pull_requests = data.slice(0, input.limit).map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.user?.login,
      head_branch: pr.head.ref,
      base_branch: pr.base.ref,
      is_draft: pr.draft,
      updated_at: pr.updated_at,
    }));

    const output = {
      total_count: pull_requests.length,
      pull_requests,
      filters_applied: {
        state: input.state,
        head_branch: input.head || null,
        base_branch: input.base || null,
        limit: input.limit,
      },
    };



    return output;
  },
});
