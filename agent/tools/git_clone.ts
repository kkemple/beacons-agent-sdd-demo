import { getSandbox } from "experimental-ash/sandbox";
import { defineTool } from "experimental-ash/tools";
import { CLONE_DIR, getRemoteURL } from "../lib/git.js";
import { z } from "zod";

const CloneRepoInput = z.object({
  branch: z.string().optional().describe("Branch to checkout after cloning. Defaults to the repository default branch."),
});

export default defineTool({
  description: "Clone the demo repository into the sandbox. If already cloned, fetches latest and optionally checks out the specified branch.",
  inputSchema: CloneRepoInput,

  async execute(input) {
    const sandbox = await getSandbox();
    const remote = getRemoteURL();

    const checkExists = await sandbox.runCommand(`test -d ${CLONE_DIR}/.git && echo exists || echo missing`);
    const alreadyCloned = checkExists.stdout.trim() === "exists";

    if (!alreadyCloned) {
      const cloneResult = await sandbox.runCommand(`git clone ${remote} ${CLONE_DIR}`);
      if (cloneResult.exitCode !== 0) {
        return { ok: false, error: cloneResult.stderr || cloneResult.stdout };
      }
    } else {
      // Update the remote URL in case token rotated, then fetch
      await sandbox.runCommand(`cd ${CLONE_DIR} && git remote set-url origin ${remote}`);
      const fetchResult = await sandbox.runCommand(`cd ${CLONE_DIR} && git fetch origin`);
      if (fetchResult.exitCode !== 0) {
        return { ok: false, error: fetchResult.stderr || fetchResult.stdout };
      }
    }

    if (input.branch) {
      const checkoutResult = await sandbox.runCommand(
        `cd ${CLONE_DIR} && git checkout ${input.branch} 2>/dev/null || git checkout -b ${input.branch}`,
      );
      if (checkoutResult.exitCode !== 0) {
        return { ok: false, error: checkoutResult.stderr || checkoutResult.stdout };
      }
    }

    const statusResult = await sandbox.runCommand(`cd ${CLONE_DIR} && git status --short && git branch --show-current`);

    return {
      ok: true,
      cloned: !alreadyCloned,
      directory: CLONE_DIR,
      branch: statusResult.stdout.trim().split("\n").pop(),
      status: statusResult.stdout.trim(),
    };
  },
});
