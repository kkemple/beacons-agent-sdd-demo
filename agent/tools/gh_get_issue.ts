import { defineTool } from "experimental-ash/tools";
import z from "zod";
import { getOctokit, parseRepo } from "../lib/github.js";


const GetIssueInput = z.object({
  issue_number: z.number().describe("GitHub issue number to fetch"),
  repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
});

export default defineTool({
  description: "Fetch GitHub issue details for a case investigation",
  inputSchema: GetIssueInput,
  async execute(input) {
    const startedAt = Date.now();

    const octokit = getOctokit();
    const { owner, repo } = parseRepo(input.repo);


    const { data: issue } = await octokit.rest.issues.get({ owner, repo, issue_number: input.issue_number });


    const comments: Array<{ user?: { login?: string }; body?: string | null; created_at: string }> = [];
    let page = 1;
    while (true) {
      const { data } = await octokit.rest.issues.listComments({ owner, repo, issue_number: input.issue_number, per_page: 100, page });
      for (const comment of data) {
        comments.push({
          user: comment.user ? { login: comment.user.login } : undefined,
          body: comment.body,
          created_at: comment.created_at,
        });
      }
      if (data.length < 100 || comments.length >= 500) break;
      page += 1;
    }


    const output = {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      author: issue.user?.login,
      labels: issue.labels.map((label) => typeof label === "string" ? label : label.name),
      comment_count: issue.comments,
      comments: comments.slice(0, 500).map((comment) => ({ author: comment.user?.login, body: comment.body, created_at: comment.created_at })),
    };

    return output;
  },
});
