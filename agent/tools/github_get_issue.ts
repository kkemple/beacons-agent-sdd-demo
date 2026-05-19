import { getOctokit } from "../lib/github.js";
import { OWNER, REPO } from "../lib/git.js";
import { defineTool } from "experimental-ash/tools";
import { z } from "zod";

const GetIssueInput = z.object({
  issue_number: z.number().int().positive().describe("Issue number to fetch."),
});

export default defineTool({
  description: "Get a GitHub issue from the demo repository by issue number.",
  inputSchema: GetIssueInput,
  async execute(input) {
    const octokit = getOctokit();
    const { data } = await octokit.rest.issues.get({
      owner: OWNER,
      repo: REPO,
      issue_number: input.issue_number,
    });

    return {
      number: data.number,
      title: data.title,
      state: data.state,
      state_reason: data.state_reason,
      url: data.html_url,
      labels: data.labels.map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean),
      assignees: data.assignees?.map((assignee) => assignee.login) ?? [],
      author: data.user?.login,
      milestone: data.milestone?.title,
      comments: data.comments,
      locked: data.locked,
      created_at: data.created_at,
      updated_at: data.updated_at,
      closed_at: data.closed_at,
      body: data.body,
    };
  },
});
