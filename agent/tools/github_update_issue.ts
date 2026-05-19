import { getOctokit } from "../lib/github.js";
import { defineTool } from "experimental-ash/tools";
import { z } from "zod";

const OWNER = "kkemple";
const REPO = "beacons-website-sdd-demo";

const UpdateIssueInput = z.object({
  issue_number: z.number().int().positive().describe("Issue number to update."),
  title: z.string().min(1).optional().describe("Replacement issue title."),
  body: z.string().optional().describe("Replacement issue body in Markdown."),
  state: z.enum(["open", "closed"]).optional().describe("Issue state."),
  state_reason: z.enum(["completed", "not_planned", "reopened"]).optional().describe("Reason for changing issue state."),
  labels: z.array(z.string().min(1)).optional().describe("Replacement label set for the issue."),
  assignees: z.array(z.string().min(1)).optional().describe("Replacement assignee set for the issue."),
});

export default defineTool({
  description: "Update a GitHub issue in the demo repository.",
  inputSchema: UpdateIssueInput,
  async execute(input) {
    const octokit = getOctokit();
    const { data } = await octokit.rest.issues.update({
      owner: OWNER,
      repo: REPO,
      issue_number: input.issue_number,
      title: input.title,
      body: input.body,
      state: input.state,
      state_reason: input.state_reason,
      labels: input.labels,
      assignees: input.assignees,
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
      created_at: data.created_at,
      updated_at: data.updated_at,
      closed_at: data.closed_at,
      body: data.body,
    };
  },
});
