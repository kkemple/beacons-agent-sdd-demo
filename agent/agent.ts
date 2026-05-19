import { defineAgent } from "experimental-ash";

export default defineAgent({
  model: "anthropic/claude-sonnet-4.6",
  compaction: { thresholdPercent: 0.75 },
});
