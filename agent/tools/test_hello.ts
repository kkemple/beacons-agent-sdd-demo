import { defineTool } from "experimental-ash/tools";
import z from "zod";

export default defineTool({
  description: "Say hello",
  inputSchema: z.object({
    greeting: z.string(),
  }),
  async execute(input) {
    return `Hello, ${input.greeting}!`;
  },
});