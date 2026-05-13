import { defineTool } from "experimental-ash/tools";
import z from "zod";
import { getOctokit, parseRepo } from "../lib/github.js";


const GetFileInput = z.object({
  path: z.string().describe("File path in the repository"),
  ref: z.string().optional().describe("Git ref (branch, tag, or commit). Defaults to the repository default branch."),
  repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
});

export default defineTool({
  description: "Fetch file contents from a GitHub repository for investigation",
  inputSchema: GetFileInput,
  async execute(input) {
    const startedAt = Date.now();

    const octokit = getOctokit();
    const { owner, repo } = parseRepo(input.repo);


    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: input.path,
      ref: input.ref,
    });



    if (Array.isArray(data)) {
      const output = { type: "directory", path: input.path, entries: data.map((entry) => ({ name: entry.name, type: entry.type, size: entry.size, path: entry.path })) };


      return output;
    }

    if (data.type !== "file") {
      const output = { type: data.type, path: data.path, message: "Not a regular file" };


      return output;
    }

    const output = {
      type: "file",
      path: data.path,
      size: data.size,
      content: data.encoding === "base64" ? Buffer.from(data.content, "base64").toString("utf8") : data.content,
    };


    return output;
  },
});
