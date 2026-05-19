import { getOctokit } from "../lib/github.js";
import { OWNER, REPO } from "../lib/git.js";
import { defineTool } from "experimental-ash/tools";
import { z } from "zod";

const GetPullRequestInput = z.object({
  pull_number: z.number().int().positive().describe("Pull request number to fetch."),
});

export default defineTool({
  description: "Get a GitHub pull request from the demo repository by pull request number.",
  inputSchema: GetPullRequestInput,
  async execute(input) {
    const octokit = getOctokit();
    const { data } = await octokit.rest.pulls.get({
      owner: OWNER,
      repo: REPO,
      pull_number: input.pull_number,
    });

    return {
      number: data.number,
      title: data.title,
      state: data.state,
      draft: data.draft,
      merged: data.merged,
      mergeable: data.mergeable,
      mergeable_state: data.mergeable_state,
      url: data.html_url,
      head: {
        ref: data.head.ref,
        sha: data.head.sha,
        repo: data.head.repo?.full_name,
      },
      base: {
        ref: data.base.ref,
        sha: data.base.sha,
        repo: data.base.repo?.full_name,
      },
      author: data.user?.login,
      requested_reviewers: data.requested_reviewers?.map((reviewer) => reviewer.login) ?? [],
      assignees: data.assignees?.map((assignee) => assignee.login) ?? [],
      labels: data.labels.map((label) => label.name).filter(Boolean),
      comments: data.comments,
      review_comments: data.review_comments,
      commits: data.commits,
      additions: data.additions,
      deletions: data.deletions,
      changed_files: data.changed_files,
      created_at: data.created_at,
      updated_at: data.updated_at,
      closed_at: data.closed_at,
      merged_at: data.merged_at,
      body: data.body,
    };
  },
});
