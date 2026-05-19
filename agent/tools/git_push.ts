import { getSandbox } from "experimental-ash/sandbox";
import { defineTool } from "experimental-ash/tools";
import { always } from "experimental-ash/tools/approval";
import { z } from "zod";

const REPO = "beacons-website-sdd-demo";
const CLONE_DIR = `/workspace/${REPO}`;

const GitPushInput = z.object({
  branch: z.string().optional().describe("Branch to push. Defaults to the current branch."),
  set_upstream: z.boolean().default(true).describe("Set upstream tracking on push."),
});

export default defineTool({
  description: "Push commits to the remote repository from the sandbox. Requires approval.",
  inputSchema: GitPushInput,
  needsApproval: always(),
  async execute(input) {
    const sandbox = await getSandbox();

    const branchResult = await sandbox.runCommand(`cd ${CLONE_DIR} && git branch --show-current`);
    const branch = input.branch || branchResult.stdout.trim();

    const upstreamFlag = input.set_upstream ? "-u origin" : "";
    const pushResult = await sandbox.runCommand(
      `cd ${CLONE_DIR} && git push ${upstreamFlag} ${branch}`,
    );

    if (pushResult.exitCode !== 0) {
      return { ok: false, error: pushResult.stderr || pushResult.stdout };
    }

    return {
      ok: true,
      branch,
      output: pushResult.stdout.trim() || pushResult.stderr.trim(),
    };
  },
});
