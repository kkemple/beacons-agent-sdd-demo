import { trace } from "@opentelemetry/api";

export function recordToolEvent(tool: string, event: string, attributes: Record<string, unknown> = {}) {
  trace.getActiveSpan()?.addEvent(`tool.${tool}.${event}`, attributes);
}

export function recordToolError(tool: string, event: string, error: unknown, attributes: Record<string, unknown> = {}) {
  const normalized = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
  trace.getActiveSpan()?.addEvent(`tool.${tool}.${event}`, { ...attributes, ...normalized });
}
