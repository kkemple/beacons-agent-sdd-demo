import { connectSlackCredentials } from "@vercel/connect/ash";
import {
  slackChannel,
  type SlackEventContext,
  type SlackChannelState,
} from "experimental-ash/channels/slack";

// ---------------------------------------------------------------------------
// Streaming state — tracks a Slack chat.startStream lifecycle per turn
// ---------------------------------------------------------------------------

interface StreamState {
  /** Slack streaming channel id (from chat.startStream response). */
  streamChannel: string;
  /** Slack streaming message ts (from chat.startStream response). */
  streamTs: string;
}

// Extend the channel state with our streaming fields.
// These are stored in SlackChannelState and auto-snapshotted at step boundaries.
declare module "experimental-ash/channels/slack" {
  interface SlackChannelState {
    activeStream?: StreamState;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Start a Slack streaming message with timeline task cards. */
async function startStream(ctx: SlackEventContext): Promise<StreamState | null> {
  if (ctx.state.activeStream) return ctx.state.activeStream;

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
    ctx.state.activeStream = stream;
    return stream;
  } catch {
    return null;
  }
}

/** Append chunks to the active Slack stream. */
async function appendStream(
  ctx: SlackEventContext,
  chunks: unknown[],
): Promise<void> {
  const stream = ctx.state.activeStream;
  if (!stream) return;

  try {
    await ctx.slack.request("chat.appendStream", {
      channel: stream.streamChannel,
      ts: stream.streamTs,
      chunks,
    });
  } catch {
    // Best-effort streaming
  }
}

/** Stop the active stream, optionally attaching footer blocks. */
async function stopStream(
  ctx: SlackEventContext,
  blocks?: unknown[],
): Promise<void> {
  const stream = ctx.state.activeStream;
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
    ctx.state.activeStream = undefined;
  }
}

/** Produce a human-friendly label for one action request. */
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
    // ------ Turn lifecycle ------

    async "turn.started"(_data, ctx) {
      // Reset per-turn streaming state
      ctx.state.activeStream = undefined;

      // Start the stream eagerly so tool cards appear immediately
      await startStream(ctx);
    },

    // ------ Tool progress as task cards ------

    async "actions.requested"(data, ctx) {
      await startStream(ctx);

      const chunks = data.actions.map((action) => ({
        type: "task_update",
        id: action.callId,
        title: labelForAction(action).slice(0, 256),
        status: "in_progress",
      }));

      await appendStream(ctx, chunks);
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

    // ------ Text streaming ------

    async "message.appended"(data, ctx) {
      await appendStream(ctx, [
        { type: "markdown_text", text: data.messageDelta },
      ]);
    },

    async "message.completed"(data, ctx) {
      if (data.finishReason === "tool-calls") return;
      if (data.message === null) return;

      // If no stream was started, fall back to a plain post
      if (!ctx.state.activeStream) {
        await ctx.thread.post({ markdown: data.message });
        return;
      }

      // Text was already streamed via message.appended deltas
    },

    // ------ Turn completion — stop stream ------

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

    // ------ Session failure ------

    async "session.failed"(data, ctx) {
      if (ctx.state.activeStream) {
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
