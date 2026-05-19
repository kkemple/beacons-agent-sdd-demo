import { getSandbox } from "experimental-ash/sandbox";
import { defineTool } from "experimental-ash/tools";
import { getOctokit } from "../lib/github.js";
import { z } from "zod";

const REPO = "beacons-website-sdd-demo";
const CLONE_DIR = `/workspace/${REPO}`;

const GitCommitInput = z.object({
  message: z.string().min(1).describe("Commit message following conventional commit format."),
  add_all: z.boolean().default(true).describe("Stage all changes before committing."),
  files: z.array(z.string()).optional().describe("Specific files to stage. Ignored if add_all is true."),
});

export default defineTool({
  description: "Stage and commit changes in the cloned repository sandbox.",
  inputSchema: GitCommitInput,
  async execute(input) {
    const sandbox = await getSandbox();

    if (input.add_all) {
      const addResult = await sandbox.runCommand(`cd ${CLONE_DIR} && git add -A`);
      if (addResult.exitCode !== 0) {
        return { ok: false, error: addResult.stderr || addResult.stdout };
      }
    } else if (input.files?.length) {
      const fileList = input.files.map((f) => JSON.stringify(f)).join(" ");
      const addResult = await sandbox.runCommand(`cd ${CLONE_DIR} && git add ${fileList}`);
      if (addResult.exitCode !== 0) {
        return { ok: false, error: addResult.stderr || addResult.stdout };
      }
    }

    const { data: user } = await getOctokit().users.getAuthenticated();
    const commitResult = await sandbox.runCommand(
      `cd ${CLONE_DIR} && git -c user.name="${user.login}" -c user.email="${user.id}+${user.login}@users.noreply.github.com" commit -m ${JSON.stringify(input.message)}`,
    );

    if (commitResult.exitCode !== 0) {
      return { ok: false, error: commitResult.stderr || commitResult.stdout };
    }

    const logResult = await sandbox.runCommand(`cd ${CLONE_DIR} && git log --oneline -1`);

    return {
      ok: true,
      commit: logResult.stdout.trim(),
      message: input.message,
    };
  },
});
