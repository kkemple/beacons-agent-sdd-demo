import { defineTool } from "experimental-ash/tools";
import z from "zod";

export default defineTool({
  description: "Say hello",
  inputSchema: z.object({
    greeting: z.string(),
  }),
  async execute(input) {
    console.info("[tool:test_hello] requested", { greeting: input.greeting });
    const output = `Hello, ${input.greeting}!`;
    console.info("[tool:test_hello] completed", { outputLength: output.length });
    return output;
  },
});