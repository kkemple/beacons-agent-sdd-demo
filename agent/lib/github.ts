import { Octokit } from "@octokit/rest";

let sdk: Octokit;

export function getOctokit(): Octokit {
  if (!sdk) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN is not set");
    sdk = new Octokit({ auth: token });
  }

  return sdk;
}
