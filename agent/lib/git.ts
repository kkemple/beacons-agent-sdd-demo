export function getGitHubURL() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return `https://x-access-token:${token}@github.com/`;
}