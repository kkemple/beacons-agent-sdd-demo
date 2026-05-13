import { getSandbox } from "experimental-ash/sandbox";
import { defineTool } from "experimental-ash/tools";
import { z } from "zod";

export default defineTool({
  description: "Creates a pull request on GitHub. Requires approval before execution.",
  inputSchema: z.object({
    title: z.string().describe("PR title"),
    body: z.string().describe("PR description/body"),
    head: z.string().describe("Head branch containing the changes"),
    base: z.string().describe("Base branch to merge into (e.g., main)"),
    draft: z.boolean().default(false).describe("Open as a draft PR"),
    repo: z.string().optional().describe("Repository in owner/repo format. Uses GITHUB_REPOSITORY if not provided."),
  }),
  async execute(input) {
    const sandbox = await getSandbox();
    const encodedInput = Buffer.from(JSON.stringify(input)).toString("base64");
    const marker = "__ASH_TOOL_RESULT__";
    const result = await sandbox.runCommand(`node <<'ASH_SANDBOX_NODE'
const input = JSON.parse(Buffer.from(${JSON.stringify(encodedInput)}, "base64").toString("utf8"));
const marker = ${JSON.stringify(marker)};
function emit(value) { console.log(marker + JSON.stringify(value)); }
(async () => {
function parseRepo(repo) {
  const value = repo || process.env.GITHUB_REPOSITORY || "";
  const [owner, name] = value.split("/");
  if (!owner || !name) throw new Error('Invalid or missing repo: "' + value + '". Provide owner/repo or set GITHUB_REPOSITORY.');
  return { owner, repo: name };
}

async function github(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  const response = await fetch("https://api.github.com" + path, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "User-Agent": "ash-casey-code-remediation-demo",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error("GitHub request failed: " + response.status + " " + response.statusText + " " + body.slice(0, 300));
  }
  return response.json();
}

const { owner, repo } = parseRepo(input.repo);
const pr = await github("/repos/" + owner + "/" + repo + "/pulls", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: input.title,
    body: input.body,
    head: input.head,
    base: input.base,
    draft: input.draft,
  }),
});

emit({
  number: pr.number,
  url: pr.html_url,
  title: pr.title,
  state: pr.state,
});
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
ASH_SANDBOX_NODE`);

    if (result.exitCode !== 0) throw new Error(`Sandbox command failed (${result.exitCode}): ${result.stderr || result.stdout}`);
    const line = result.stdout.split("\n").reverse().find((entry) => entry.startsWith(marker));
    if (!line) throw new Error(`Sandbox command did not return a result: ${result.stdout || result.stderr}`);
    return JSON.parse(line.slice(marker.length));
  },
});
