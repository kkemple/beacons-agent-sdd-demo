export const OWNER = "kkemple";
export const REPO = "beacons-website-sdd-demo";
export const CLONE_DIR = `/workspace/${REPO}`;

/**
 * Authenticated GitHub HTTPS URL prefix.
 * Embeds the token directly so no git config or env vars are needed in the sandbox.
 */
export function getGitHubURL() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return `https://x-access-token:${token}@github.com/`;
}

/** Full authenticated remote URL for the target repo. */
export function getRemoteURL() {
  return `${getGitHubURL()}${OWNER}/${REPO}.git`;
}
