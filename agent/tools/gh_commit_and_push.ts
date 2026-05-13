import { defineTool } from "experimental-ash/tools";
import { z } from "zod";
import { getOctokit, parseRepo } from "../lib/github.js";

const FileChange = z.object({
  path: z.string().describe("File path in the repository"),
  content: z.string().describe("Full file content to write"),
});

export default defineTool({
  description: "Commit one or more file changes to a branch. Requires approval before execution.",
  inputSchema: z.object({
    branch: z.string().describe("Branch to commit to"),
    message: z.string().describe("Commit message"),
    files: z.array(FileChange).min(1).describe("Files to create or update"),
    repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
  }),
  async execute(input) {
    const startedAt = Date.now();

    const octokit = getOctokit();
    const { owner, repo } = parseRepo(input.repo);


    const { data: ref } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${input.branch}` });
    const latestCommitSha = ref.object.sha;

    const { data: commit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: latestCommitSha });

    const treeItems = await Promise.all(input.files.map(async (file) => {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: Buffer.from(file.content).toString("base64"),
        encoding: "base64",
      });


      return { path: file.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
    }));

    const { data: tree } = await octokit.rest.git.createTree({ owner, repo, base_tree: commit.tree.sha, tree: treeItems });
    const { data: newCommit } = await octokit.rest.git.createCommit({ owner, repo, message: input.message, tree: tree.sha, parents: [latestCommitSha] });

    await octokit.rest.git.updateRef({ owner, repo, ref: `heads/${input.branch}`, sha: newCommit.sha });
    const output = { branch: input.branch, message: input.message, sha: newCommit.sha, files: input.files.map((file) => file.path), url: `https://github.com/${owner}/${repo}/tree/${input.branch}` };

    return output;
  },
});
