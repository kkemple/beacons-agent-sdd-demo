import { defineTool } from "experimental-ash/tools";
import z from "zod";
import { getOctokit, parseRepo } from "../lib/github.js";


export default defineTool({
  description: "Create a new branch for code remediation work. Requires approval before execution.",
  inputSchema: z.object({
    branch_name: z.string().describe("New branch name, preferably case-<issue>-short-summary format"),
    base_branch: z.string().optional().describe("Base branch to create from. Defaults to the repository default branch."),
    repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
  }),
  async execute(input) {
    const startedAt = Date.now();

    const octokit = getOctokit();
    const { owner, repo } = parseRepo(input.repo);


    let baseBranch = input.base_branch;
    if (!baseBranch) {
      const { data: repository } = await octokit.rest.repos.get({ owner, repo });
      baseBranch = repository.default_branch;

    }

    const { data: ref } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${baseBranch}` });



    const { data: newRef } = await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${input.branch_name}`, sha: ref.object.sha });
    const output = {
      branch: input.branch_name,
      sha: newRef.object.sha,
      url: `https://github.com/${owner}/${repo}/tree/${input.branch_name}`,
    };


    return output;
  },
});
