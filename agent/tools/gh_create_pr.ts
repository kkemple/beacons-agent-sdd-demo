import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { getOctokit, parseRepo } from "../lib/github.js";


export default defineTool({
  description: "Creates a pull request on GitHub. Requires approval before execution.",
  inputSchema: z.object({
    title: z.string().describe("PR title"),
    body: z.string().describe("PR description/body"),
    head: z.string().describe("Head branch containing the changes"),
    base: z.string().describe("Base branch to merge into (e.g., main)"),
    draft: z.boolean().default(false).describe("Open as a draft PR"),
    repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
  }),
  async execute(input) {
    const startedAt = Date.now();

    const octokit = getOctokit();
    const { owner, repo } = parseRepo(input.repo);


    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo,
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
      draft: input.draft,
    });



    const output = {
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      state: pr.state,
    };


    return output;
  },
});
