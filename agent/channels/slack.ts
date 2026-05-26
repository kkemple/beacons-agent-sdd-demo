import { connectSlackCredentials } from "@vercel/connect/ash";
import {
  slackRoute,
  defineSlackAdapter,
  type SlackAdapterContext,
} from "experimental-ash/channels/slack";
import type { SlackChannelState } from "experimental-ash/channels/slack";

// ---------------------------------------------------------------------------
// Streaming state — tracks a Slack chat.startStream lifecycle per turn
// ---------------------------------------------------------------------------

interface StreamState {
  /** Slack streaming channel id (from chat.startStream response). */
  streamChannel: string;
  /** Slack streaming message ts (from chat.startStream response). */
  streamTs: string;
}

interface StreamingAdapterState {
  /** Active stream for the current turn, if any. */
  activeStream?: StreamState;
  /** Accumulated token usage across steps in the current turn. */
  turnUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

type AdapterCtx = SlackAdapterContext<StreamingAdapterState & SlackChannelState>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Start a Slack streaming message with timeline task cards. */
async function startStream(ctx: AdapterCtx): Promise<StreamState | null> {
  // Already have an active stream for this turn
  if (ctx.state.activeStream) return ctx.state.activeStream;

  try {
    const res = await ctx.slack.request("chat.startStream", {
      channel: ctx.slack.channelId,
      thread_ts: ctx.slack.threadTs,
      task_display_mode: "timeline",
    });

    if (!res.ok) return null;

    const stream: StreamState = {
      streamChannel: (res as any).channel,
      streamTs: (res as any).ts,
    };
    ctx.state.activeStream = stream;
    return stream;
  } catch {
    return null;
  }
}

/** Append chunks to the active Slack stream. */
async function appendStream(
  ctx: AdapterCtx,
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
    // Swallow — best-effort streaming
  }
}

/** Stop the active stream, optionally attaching footer blocks. */
async function stopStream(
  ctx: AdapterCtx,
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

/** Format a compact metadata footer from accumulated usage. */
function formatMetadataFooter(usage?: {
  inputTokens: number;
  outputTokens: number;
}): string | null {
  if (!usage) return null;
  const parts: string[] = [];
  if (usage.outputTokens) {
    parts.push(`${(usage.outputTokens / 1000).toFixed(1)}k tokens`);
  }
  if (usage.inputTokens) {
    parts.push(`${(usage.inputTokens / 1000).toFixed(0)}k input`);
  }
  return parts.length > 0 ? parts.join("  ·  ") : null;
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
// Adapter — overrides default Slack event handlers with streaming + task cards
// ---------------------------------------------------------------------------

const streamingAdapter = defineSlackAdapter({
  // ------ Turn lifecycle ------

  async "turn.started"(_data, ctx) {
    // Reset per-turn streaming state
    ctx.state.activeStream = undefined;
    ctx.state.turnUsage = undefined;

    // Start the stream eagerly so tool cards appear immediately
    await startStream(ctx);
  },

  // ------ Tool progress as task cards ------

  async "actions.requested"(data, ctx) {
    // Ensure stream is open
    await startStream(ctx);

    // Emit a task_update for each action in the batch
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

    // Determine a summary for the task card output
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
    // Tool-call intermediary messages — skip, the task cards tell the story
    if (data.finishReason === "tool-calls") return;
    if (data.message === null) return;

    // If somehow no stream was started (e.g. fast single-message response),
    // fall back to a plain post
    if (!ctx.state.activeStream) {
      await ctx.thread.post({ markdown: data.message });
      return;
    }

    // The message text was already streamed via message.appended deltas,
    // so we don't need to re-post it here. Just let the stream continue.
  },

  // ------ Step usage tracking ------

  async "step.completed"(data, ctx) {
    if (data.usage) {
      const prev = ctx.state.turnUsage ?? { inputTokens: 0, outputTokens: 0 };
      ctx.state.turnUsage = {
        inputTokens: prev.inputTokens + (data.usage.inputTokens ?? 0),
        outputTokens: prev.outputTokens + (data.usage.outputTokens ?? 0),
      };
    }
  },

  // ------ Turn completion — stop stream with footer ------

  async "turn.completed"(_data, ctx) {
    const footer = formatMetadataFooter(ctx.state.turnUsage);
    const blocks = footer
      ? [
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: footer }],
          },
        ]
      : undefined;

    await stopStream(ctx, blocks);
  },

  async "turn.failed"(data, ctx) {
    // Stream an error message then stop
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
});

// ---------------------------------------------------------------------------
// Export the Slack route with the streaming adapter
// ---------------------------------------------------------------------------

export default slackRoute({
  botName: "triage-agent",
  credentials: connectSlackCredentials("slack/triage-agent"),
  adapter: streamingAdapter,
});
