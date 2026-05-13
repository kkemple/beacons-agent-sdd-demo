import { Octokit } from "@octokit/rest";

export function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return new Octokit({ auth: token });
}

export function parseRepo(repo?: string): { owner: string; repo: string } {
  const r = repo || process.env.GITHUB_REPOSITORY || "";
  const [owner, repoName] = r.split("/");
  if (!owner || !repoName) throw new Error(`Invalid or missing repo: "${r}". Provide owner/repo or set GITHUB_REPOSITORY.`);
  return { owner, repo: repoName };
}
