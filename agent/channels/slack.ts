import { connectSlackCredentials } from "@vercel/connect/ash";
import { slackChannel } from "experimental-ash/channels/slack";

const MRKDWN_MAX = 2900;
const FALLBACK_TEXT_MAX = 3900;
const PLAIN_TEXT_MAX = 75;
const ACTIONS_MAX = 25;
const BLOCKS_MAX = 50;

function truncate(value: string, max: number): string {
  if (!value) return " ";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3).trimEnd()}...`;
}

export default slackChannel({
  botName: "triage-agent",
  credentials: connectSlackCredentials("slack/triage-agent"),
  events: {
    async "input.requested"(data, ctx) {
      if (data.requests.length === 0) return;

      const blocks: unknown[] = [];
      const fallbackParts: string[] = [];

      for (const req of data.requests) {
        const promptText = truncate(req.prompt ?? "", MRKDWN_MAX);
        fallbackParts.push(promptText);
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: promptText },
        });

        const options = req.options ?? [];
        if (options.length > 0) {
          blocks.push({
            type: "actions",
            elements: options.slice(0, ACTIONS_MAX).map((opt, i) => ({
              type: "button",
              action_id: `ash_input:${req.requestId}:button:${i}`,
              text: { type: "plain_text", text: truncate(opt.label, PLAIN_TEXT_MAX) },
              value: opt.id,
              ...(opt.style === "primary" || opt.style === "danger"
                ? { style: opt.style }
                : {}),
            })),
          });
        } else {
          blocks.push({
            type: "actions",
            elements: [
              {
                type: "button",
                action_id: `ash_input_freeform:${req.requestId}`,
                text: { type: "plain_text", text: "Type your answer" },
                style: "primary",
                value: req.requestId,
              },
            ],
          });
        }
      }

      const safeBlocks = blocks.slice(0, BLOCKS_MAX);
      const text = truncate(fallbackParts.join("\n"), FALLBACK_TEXT_MAX);

      try {
        await ctx.thread.post({ blocks: safeBlocks, text });
      } catch {
        await ctx.thread.post(text);
      }
    },
  },
});
