import { defineAgent } from "experimental-ash";

export default defineAgent({
  model: "openai/gpt-5.3-codex",
  compaction: { thresholdPercent: 0.75 },
});
