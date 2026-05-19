import { getSandbox } from "experimental-ash/sandbox";
import { defineTool } from "experimental-ash/tools";
import { CLONE_DIR, getRemoteURL } from "../lib/git.js";
import { z } from "zod";

const GitPushInput = z.object({
  branch: z.string().optional().describe("Branch to push. Defaults to the current branch."),
});

export default defineTool({
  description: "Push commits to the remote repository from the sandbox.",
  inputSchema: GitPushInput,

  async execute(input) {
    const sandbox = await getSandbox();

    const branchResult = await sandbox.runCommand(`cd ${CLONE_DIR} && git branch --show-current`);
    const branch = input.branch || branchResult.stdout.trim();

    // Push directly to the authenticated remote URL
    const pushResult = await sandbox.runCommand(
      `cd ${CLONE_DIR} && git push ${getRemoteURL()} ${branch}`,
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
