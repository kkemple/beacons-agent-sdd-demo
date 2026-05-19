import { getOctokit } from "../lib/github.js";
import { OWNER, REPO } from "../lib/git.js";
import { defineTool } from "experimental-ash/tools";
import { z } from "zod";

const MergePullRequestInput = z.object({
  pull_number: z.number().int().positive().describe("Pull request number to merge."),
  merge_method: z.enum(["merge", "squash", "rebase"]).default("squash").describe("Merge strategy to use."),
  commit_title: z.string().optional().describe("Custom merge commit title. Defaults to PR title."),
  commit_message: z.string().optional().describe("Custom merge commit message. Defaults to PR body."),
  delete_branch: z.boolean().default(true).describe("Delete the head branch after merging."),
});

export default defineTool({
  description: "Merge a GitHub pull request in the demo repository.",
  inputSchema: MergePullRequestInput,
  async execute(input) {
    const octokit = getOctokit();

    const { data: mergeResult } = await octokit.rest.pulls.merge({
      owner: OWNER,
      repo: REPO,
      pull_number: input.pull_number,
      merge_method: input.merge_method,
      commit_title: input.commit_title,
      commit_message: input.commit_message,
    });

    let branchDeleted = false;
    if (input.delete_branch && mergeResult.merged) {
      const { data: pr } = await octokit.rest.pulls.get({
        owner: OWNER,
        repo: REPO,
        pull_number: input.pull_number,
      });

      try {
        await octokit.rest.git.deleteRef({
          owner: OWNER,
          repo: REPO,
          ref: `heads/${pr.head.ref}`,
        });
        branchDeleted = true;
      } catch {
        branchDeleted = false;
      }
    }

    return {
      merged: mergeResult.merged,
      sha: mergeResult.sha,
      message: mergeResult.message,
      branchDeleted,
    };
  },
});
