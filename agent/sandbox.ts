// agent/sandbox.ts
import { defineSandbox } from "experimental-ash/sandbox";

export default defineSandbox({
    async bootstrap({ use }) {
        const sandbox = await use({ runtime: "node24", ports: [3000] });
        await sandbox.runCommand("npm install");
    },
});
