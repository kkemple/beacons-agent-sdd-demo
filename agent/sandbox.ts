import { defineSandbox, vercelBackend } from "experimental-ash/sandbox";

export default defineSandbox({
  backend: vercelBackend(),

  async bootstrap({ use }) {
    const token = process.env.GITHUB_TOKEN ?? "";
    const sandbox = await use({
      env: {
        GITHUB_TOKEN: token,
      },
    });

    await sandbox.runCommand(`git config --global user.email "agent@beacons-demo.dev"`);
    await sandbox.runCommand(`git config --global user.name "Triage Agent"`);
  },
});
