import { defineTool } from "experimental-ash/tools";
import z from "zod";
import { recordToolEvent } from "../lib/telemetry.js";

export default defineTool({
  description: "Say hello",
  inputSchema: z.object({
    greeting: z.string(),
  }),
  async execute(input) {
    recordToolEvent("test_hello", "requested", { greeting: input.greeting });
    const output = `Hello, ${input.greeting}!`;
    recordToolEvent("test_hello", "completed", { outputLength: output.length });
    return output;
  },
});