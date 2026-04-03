export interface StreamEvent {
  node: string;
  status: "started" | "completed" | "error";
  timestamp: string;
  data?: Record<string, unknown>;
}

type StreamController = ReadableStreamDefaultController<Uint8Array>;

const activeStreams = new Map<string, StreamController>();

export function registerStream(scriptId: string, controller: StreamController) {
  activeStreams.set(scriptId, controller);
}

export function unregisterStream(scriptId: string) {
  activeStreams.delete(scriptId);
}

export function addStreamEvent(scriptId: string, event: StreamEvent) {
  const controller = activeStreams.get(scriptId);
  if (!controller) return;

  try {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    controller.enqueue(new TextEncoder().encode(data));
  } catch {
    // Stream may have been closed
    activeStreams.delete(scriptId);
  }
}

export function closeStream(scriptId: string) {
  const controller = activeStreams.get(scriptId);
  if (!controller) return;

  try {
    const data = `data: ${JSON.stringify({ node: "done", status: "completed", timestamp: new Date().toISOString() })}\n\n`;
    controller.enqueue(new TextEncoder().encode(data));
    controller.close();
  } catch {
    // Already closed
  }
  activeStreams.delete(scriptId);
}
