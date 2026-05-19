import { getSandbox } from "experimental-ash/sandbox";
import { defineTool } from "experimental-ash/tools";
import { CLONE_DIR } from "../lib/git.js";
import { z } from "zod";

const GitDiffInput = z.object({
  target: z.string().default("").describe("Diff target: a branch, commit, or empty for unstaged changes."),
  stat_only: z.boolean().default(false).describe("Show only file names and change counts."),
});

export default defineTool({
  description: "Show git diff output in the cloned repository sandbox.",
  inputSchema: GitDiffInput,

  async execute(input) {
    const sandbox = await getSandbox();

    const args = [input.stat_only && "--stat", input.target].filter(Boolean).join(" ");
    const diffResult = await sandbox.runCommand(`cd ${CLONE_DIR} && git diff ${args}`);

    if (diffResult.exitCode !== 0) {
      return { ok: false, error: diffResult.stderr || diffResult.stdout };
    }

    return {
      ok: true,
      diff: diffResult.stdout.trim() || "No changes.",
    };
  },
});
