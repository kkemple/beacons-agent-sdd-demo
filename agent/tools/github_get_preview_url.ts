import { getOctokit } from "../lib/github.js";
import { defineTool } from "experimental-ash/tools";
import { z } from "zod";

const OWNER = "kkemple";
const REPO = "beacons-website-sdd-demo";

const GetPreviewUrlInput = z.object({
  pull_number: z.number().int().positive().describe("Pull request number to get the Vercel preview URL for."),
});

export default defineTool({
  description: "Get the Vercel preview deployment URL for a pull request.",
  inputSchema: GetPreviewUrlInput,
  async execute(input) {
    const octokit = getOctokit();

    const { data: pr } = await octokit.rest.pulls.get({
      owner: OWNER,
      repo: REPO,
      pull_number: input.pull_number,
    });

    const { data: deployments } = await octokit.rest.repos.listDeployments({
      owner: OWNER,
      repo: REPO,
      ref: pr.head.sha,
      environment: "Preview",
      per_page: 1,
    });

    if (!deployments.length) {
      return { ok: false, error: "No preview deployment found for this PR." };
    }

    const { data: statuses } = await octokit.rest.repos.listDeploymentStatuses({
      owner: OWNER,
      repo: REPO,
      deployment_id: deployments[0].id,
      per_page: 5,
    });

    const success = statuses.find((s) => s.state === "success");

    if (!success) {
      const latest = statuses[0];
      return {
        ok: false,
        state: latest?.state ?? "unknown",
        error: "Preview deployment has not completed successfully yet.",
      };
    }

    return {
      ok: true,
      url: success.environment_url,
      deployment_id: deployments[0].id,
      sha: pr.head.sha,
    };
  },
});
