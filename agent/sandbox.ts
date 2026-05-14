// agent/sandbox.ts
import { defineSandbox, vercelBackend } from "experimental-ash/sandbox";

export default defineSandbox({
  backend: vercelBackend(),

  async bootstrap({ use }) {
    const token = process.env.GITHUB_TOKEN ?? "";
    const sandbox = await use({ env: {
        GITHUB_TOKEN: token
    }});
    await sandbox.runCommand(`
      if [ -n "\${GITHUB_TOKEN:-}" ]; then
        git config --global url."https://x-access-token:$GITHUB_TOKEN@github.com/".insteadOf "https://github.com/"
      fi
    `);
  },
});
