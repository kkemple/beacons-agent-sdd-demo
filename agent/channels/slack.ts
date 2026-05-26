import { connectSlackCredentials } from "@vercel/connect/ash";
import {
  slackChannel,
  type SlackEventContext,
} from "experimental-ash/channels/slack";

// ---------------------------------------------------------------------------
// Streaming state — module-scoped, keyed by thread
// ---------------------------------------------------------------------------

interface StreamState {
  streamChannel: string;
  streamTs: string;
}

/** Active streams keyed by `channelId:threadTs`. */
const activeStreams = new Map<string, StreamState>();

function streamKey(ctx: SlackEventContext): string {
  return `${ctx.slack.channelId}:${ctx.slack.threadTs}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function startStream(ctx: SlackEventContext): Promise<StreamState | null> {
  const key = streamKey(ctx);
  const existing = activeStreams.get(key);
  if (existing) return existing;

  try {
    const res = await ctx.slack.request("chat.startStream", {
      channel: ctx.slack.channelId,
      thread_ts: ctx.slack.threadTs,
      task_display_mode: "timeline",
    });
    if (!res.ok) return null;

    const stream: StreamState = {
      streamChannel: res.channel as string,
      streamTs: res.ts as string,
    };
    activeStreams.set(key, stream);
    return stream;
  } catch {
    return null;
  }
}

async function appendStream(
  ctx: SlackEventContext,
  chunks: unknown[],
): Promise<void> {
  const stream = activeStreams.get(streamKey(ctx));
  if (!stream) return;

  try {
    await ctx.slack.request("chat.appendStream", {
      channel: stream.streamChannel,
      ts: stream.streamTs,
      chunks,
    });
  } catch {
    // Best-effort
  }
}

async function stopStream(
  ctx: SlackEventContext,
  blocks?: unknown[],
): Promise<void> {
  const key = streamKey(ctx);
  const stream = activeStreams.get(key);
  if (!stream) return;

  try {
    await ctx.slack.request("chat.stopStream", {
      channel: stream.streamChannel,
      ts: stream.streamTs,
      ...(blocks ? { blocks } : {}),
    });
  } catch {
    // Swallow
  } finally {
    activeStreams.delete(key);
  }
}

function labelForAction(action: {
  kind: string;
  toolName?: string;
  subagentName?: string;
}): string {
  if (action.kind === "tool-call" && action.toolName) return action.toolName;
  if (action.kind === "subagent-call" && action.subagentName)
    return action.subagentName;
  return action.kind;
}

// ---------------------------------------------------------------------------
// Channel — slackChannel with streaming + task card event overrides
// ---------------------------------------------------------------------------

export default slackChannel({
  botName: "triage-agent",
  credentials: connectSlackCredentials("slack/triage-agent"),

  events: {
    async "turn.started"(_data, ctx) {
      activeStreams.delete(streamKey(ctx));
      await startStream(ctx);
    },

    async "actions.requested"(data, ctx) {
      await startStream(ctx);
      await appendStream(
        ctx,
        data.actions.map((action) => ({
          type: "task_update",
          id: action.callId,
          title: labelForAction(action).slice(0, 256),
          status: "in_progress",
        })),
      );
    },

    async "action.result"(data, ctx) {
      const result = data.result;
      const isError = data.status === "failed";

      let output: string | undefined;
      if (isError && data.error) {
        output = data.error.message.slice(0, 256);
      }

      await appendStream(ctx, [
        {
          type: "task_update",
          id: result.callId,
          title: labelForAction(result as any).slice(0, 256),
          status: isError ? "error" : "complete",
          ...(output ? { output } : {}),
        },
      ]);
    },

    async "message.appended"(data, ctx) {
      await appendStream(ctx, [
        { type: "markdown_text", text: data.messageDelta },
      ]);
    },

    async "message.completed"(data, ctx) {
      if (data.finishReason === "tool-calls") return;
      if (data.message === null) return;

      // If no stream was started, fall back to a plain post
      if (!activeStreams.has(streamKey(ctx))) {
        await ctx.thread.post({ markdown: data.message });
        return;
      }
      // Text was already streamed via message.appended deltas
    },

    async "turn.completed"(_data, ctx) {
      await stopStream(ctx);
    },

    async "turn.failed"(data, ctx) {
      await appendStream(ctx, [
        {
          type: "markdown_text",
          text: `:warning: Error: ${data.message || "Something went wrong."}`,
        },
      ]);
      await stopStream(ctx);
    },

    async "session.failed"(data, ctx) {
      if (activeStreams.has(streamKey(ctx))) {
        await appendStream(ctx, [
          {
            type: "markdown_text",
            text: `:warning: Session failed: ${data.message || "Something went wrong."}`,
          },
        ]);
        await stopStream(ctx);
      } else {
        await ctx.thread.post({
          markdown: `:warning: Session failed: ${data.message || "Something went wrong."}\n\nStart a new thread to continue.`,
        });
      }
    },
  },
});
