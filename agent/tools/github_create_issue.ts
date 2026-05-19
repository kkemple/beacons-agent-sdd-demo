import { getOctokit } from "../lib/github.js";
import { defineTool } from "experimental-ash/tools";
import { always } from "experimental-ash/tools/approval";
import { z } from "zod";

const OWNER = "kkemple";
const REPO = "beacons-website-sdd-demo";

const CreateIssueInput = z.object({
  title: z.string().min(1).describe("Issue title."),
  body: z.string().default("").describe("Issue body in Markdown."),
  labels: z.array(z.string().min(1)).default([]).describe("Labels to add to the issue."),
  assignees: z.array(z.string().min(1)).default([]).describe("GitHub usernames to assign."),
});

export default defineTool({
  description: "Create a GitHub issue in the demo repository. Requires approval.",
  inputSchema: CreateIssueInput,
  needsApproval: always(),
  async execute(input) {
    const octokit = getOctokit();
    const { data } = await octokit.rest.issues.create({
      owner: OWNER,
      repo: REPO,
      title: input.title,
      body: input.body,
      labels: input.labels.length ? input.labels : undefined,
      assignees: input.assignees.length ? input.assignees : undefined,
    });

    return {
      number: data.number,
      title: data.title,
      state: data.state,
      url: data.html_url,
      labels: data.labels.map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean),
      assignees: data.assignees?.map((assignee) => assignee.login) ?? [],
      author: data.user?.login,
      created_at: data.created_at,
      updated_at: data.updated_at,
      body: data.body,
    };
  },
});
