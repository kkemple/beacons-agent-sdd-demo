import { defineTool } from "experimental-ash/tools";
import z from "zod";

import { getOctokit, parseRepo } from "../lib/github.js";


const GetPRInput = z.object({
  pr_number: z.number().describe("GitHub pull request number to fetch"),
  include_comments: z.boolean().default(false).describe("Include PR comments in the response"),
  repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
});

export default defineTool({
  description: "Fetch GitHub pull request details for case investigation",
  inputSchema: GetPRInput,
  async execute(input) {
    const startedAt = Date.now();

    const octokit = getOctokit();
    const { owner, repo } = parseRepo(input.repo);


    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: input.pr_number });


    let issueComments: Array<{ user?: { login?: string }; body?: string | null; created_at: string }> | undefined;
    let reviewComments: Array<{ user?: { login?: string }; body?: string | null; path?: string; line?: number | null; created_at: string }> | undefined;

    if (input.include_comments) {
      issueComments = [];
      reviewComments = [];

      let page = 1;
      while (true) {
        const { data } = await octokit.rest.issues.listComments({ owner, repo, issue_number: input.pr_number, per_page: 100, page });
        for (const comment of data) {
          issueComments.push({
            user: comment.user ? { login: comment.user.login } : undefined,
            body: comment.body,
            created_at: comment.created_at,
          });
        }
        if (data.length < 100 || issueComments.length >= 500) break;
        page += 1;
      }

      page = 1;
      while (true) {
        const { data } = await octokit.rest.pulls.listReviewComments({ owner, repo, pull_number: input.pr_number, per_page: 100, page });
        for (const comment of data) {
          reviewComments.push({
            user: comment.user ? { login: comment.user.login } : undefined,
            body: comment.body,
            path: comment.path,
            line: comment.line,
            created_at: comment.created_at,
          });
        }
        if (data.length < 100 || reviewComments.length >= 500) break;
        page += 1;
      }


        issueComments: issueComments.length,
        reviewComments: reviewComments.length,
        issueCapped: issueComments.length >= 500,
        reviewCapped: reviewComments.length >= 500,
      });
    }

    const output = {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      author: pr.user?.login,
      labels: pr.labels.map((label) => typeof label === "string" ? label : label.name),
      head_branch: pr.head.ref,
      base_branch: pr.base.ref,
      is_draft: pr.draft,
      mergeable: pr.mergeable,
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      ...(issueComments || reviewComments
        ? {
            comments: {
              issue: (issueComments ?? []).slice(0, 500).map((comment) => ({ author: comment.user?.login, body: comment.body, created_at: comment.created_at })),
              review: (reviewComments ?? []).slice(0, 500).map((comment) => ({ author: comment.user?.login, body: comment.body, path: comment.path, line: comment.line, created_at: comment.created_at })),
            },
          }
        : {}),
    };

    return output;
  },
});
