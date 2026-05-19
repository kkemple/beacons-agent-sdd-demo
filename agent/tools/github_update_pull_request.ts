import { getOctokit } from "../lib/github.js";
import { defineTool } from "experimental-ash/tools";
import { z } from "zod";

const OWNER = "kkemple";
const REPO = "beacons-website-sdd-demo";

const UpdatePullRequestInput = z.object({
  pull_number: z.number().int().positive().describe("Pull request number to update."),
  title: z.string().min(1).optional().describe("Replacement pull request title."),
  body: z.string().optional().describe("Replacement pull request body in Markdown."),
  state: z.enum(["open", "closed"]).optional().describe("Pull request state."),
  base: z.string().min(1).optional().describe("Replacement base branch name."),
  maintainer_can_modify: z.boolean().optional().describe("Allow maintainers to modify the pull request branch."),
});

export default defineTool({
  description: "Update a GitHub pull request in the demo repository.",
  inputSchema: UpdatePullRequestInput,
  async execute(input) {
    const octokit = getOctokit();
    const { data } = await octokit.rest.pulls.update({
      owner: OWNER,
      repo: REPO,
      pull_number: input.pull_number,
      title: input.title,
      body: input.body,
      state: input.state,
      base: input.base,
      maintainer_can_modify: input.maintainer_can_modify,
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
      created_at: data.created_at,
      updated_at: data.updated_at,
      closed_at: data.closed_at,
      merged_at: data.merged_at,
      body: data.body,
    };
  },
});
