import { getOctokit } from "../lib/github.js";
import { OWNER, REPO } from "../lib/git.js";
import { defineTool } from "experimental-ash/tools";
import { z } from "zod";

const CreatePullRequestInput = z.object({
  title: z.string().min(1).describe("Pull request title."),
  body: z.string().min(1).describe("Pull request body."),
  head: z.string().min(1).describe("Name of the already-pushed branch to open the PR from."),
  base: z.string().default("main").describe("Base branch for the PR."),
  draft: z.boolean().default(false).describe("Create as draft PR."),
});

export default defineTool({
  description: "Create a GitHub pull request in the demo repository after a branch has been pushed.",
  inputSchema: CreatePullRequestInput,
  async execute(input) {
    const octokit = getOctokit();
    const { data } = await octokit.rest.pulls.create({
      owner: OWNER,
      repo: REPO,
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
      draft: input.draft,
    });

    return {
      number: data.number,
      title: data.title,
      state: data.state,
      url: data.html_url,
      head: data.head.ref,
      base: data.base.ref,
    };
  },
});
