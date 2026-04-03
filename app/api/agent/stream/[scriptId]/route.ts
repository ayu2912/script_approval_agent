import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { runChaserForScript } from "@/lib/agent/graph";
import { registerStream, unregisterStream, addStreamEvent, closeStream } from "@/lib/agent/stream";
import type { AgentState } from "@/lib/agent/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const { scriptId } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data: script, error } = await supabase
    .from("scripts")
    .select("id, title, content, client_id, sent_at, due_date, status, clients(id, name, email)")
    .eq("id", scriptId)
    .single();

  if (error || !script) {
    return new Response(JSON.stringify({ error: "Script not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const client = script.clients;
  if (!client) {
    return new Response(JSON.stringify({ error: "Client not found" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sentDate = script.sent_at ? new Date(script.sent_at) : new Date();
  const hoursOverdue = Math.max(0, Math.round((Date.now() - sentDate.getTime()) / (1000 * 60 * 60)));

  const AGENT_STREAM_TIMEOUT_MS = 600_000;

  const stream = new ReadableStream({
    start(controller) {
      registerStream(scriptId, controller);

      const timeoutId = setTimeout(() => {
        console.warn(`[agent-stream] Timeout after ${AGENT_STREAM_TIMEOUT_MS}ms for script=${scriptId}`);
        addStreamEvent(scriptId, {
          node: "pipeline",
          status: "error",
          timestamp: new Date().toISOString(),
          data: { type: "timeout", message: "Stream exceeded maximum duration" },
        });
        closeStream(scriptId);
      }, AGENT_STREAM_TIMEOUT_MS);

      addStreamEvent(scriptId, {
        node: "pipeline",
        status: "started",
        timestamp: new Date().toISOString(),
        data: { scriptTitle: script.title, clientName: client.name },
      });

      const initialState: AgentState = {
        scriptId: script.id,
        clientId: client.id,
        clientEmail: client.email,
        clientName: client.name,
        scriptTitle: script.title,
        scriptContent: script.content,
        sentAt: script.sent_at ?? new Date().toISOString(),
        dueDate: script.due_date ?? null,
        hoursOverdue,
        clientMemories: [],
        generatedEmail: null,
        emailSubject: null,
        chaserId: null,
        error: null,
        urgencyScore: null,
        toneRecommendation: null,
        critiqueScores: null,
        revisionCount: 0,
        nodeExecutionLog: [],
      };

      runChaserForScript(initialState)
        .then((result) => {
          clearTimeout(timeoutId);
          addStreamEvent(scriptId, {
            node: "result",
            status: result.error ? "error" : "completed",
            timestamp: new Date().toISOString(),
            data: {
              chaserId: result.chaserId,
              subject: result.emailSubject,
              urgencyScore: result.urgencyScore,
              toneRecommendation: result.toneRecommendation,
              critiqueScores: result.critiqueScores,
              revisionCount: result.revisionCount,
              error: result.error,
              log: result.nodeExecutionLog,
            },
          });
          closeStream(scriptId);
        })
        .catch((err) => {
          clearTimeout(timeoutId);
          addStreamEvent(scriptId, {
            node: "pipeline",
            status: "error",
            timestamp: new Date().toISOString(),
            data: { error: err instanceof Error ? err.message : "Unknown error" },
          });
          closeStream(scriptId);
        });
    },
    cancel() {
      unregisterStream(scriptId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
