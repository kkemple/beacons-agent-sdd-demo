import { getSandbox } from "experimental-ash/sandbox";
import { defineTool } from "experimental-ash/tools";
import { CLONE_DIR } from "../lib/git.js";
import { z } from "zod";

export default defineTool({
  description: "Show git status, current branch, and recent log in the cloned repository sandbox.",
  inputSchema: z.object({}),

  async execute() {
    const sandbox = await getSandbox();

    const [status, branch, log] = await Promise.all([
      sandbox.runCommand(`cd ${CLONE_DIR} && git status --short`),
      sandbox.runCommand(`cd ${CLONE_DIR} && git branch --show-current`),
      sandbox.runCommand(`cd ${CLONE_DIR} && git log --oneline -10`),
    ]);

    if (status.exitCode !== 0) {
      return { ok: false, error: status.stderr || "Repository not found. Run git_clone first." };
    }

    return {
      ok: true,
      branch: branch.stdout.trim(),
      status: status.stdout.trim() || "clean",
      recent_commits: log.stdout.trim(),
    };
  },
});
