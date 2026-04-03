import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { runChaserForScript } from "@/lib/agent/graph";
import type { AgentState } from "@/lib/agent/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function POST(
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
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  if (script.status === "closed") {
    return NextResponse.json(
      { error: "Cannot run agent on a closed script" },
      { status: 400 }
    );
  }

  const { data: existingChaser } = await supabase
    .from("chasers")
    .select("id")
    .eq("script_id", scriptId)
    .eq("status", "pending_hitl")
    .maybeSingle();

  if (existingChaser) {
    return NextResponse.json(
      { error: "A chaser is already pending review for this script" },
      { status: 409 }
    );
  }

  const client = script.clients;
  if (!client) {
    return NextResponse.json({ error: "Client not found for script" }, { status: 400 });
  }

  const sentDate = new Date(script.sent_at);
  const hoursOverdue = Math.round((Date.now() - sentDate.getTime()) / (1000 * 60 * 60));

  const initialState: AgentState = {
    scriptId: script.id,
    clientId: client.id,
    clientEmail: client.email,
    clientName: client.name,
    scriptTitle: script.title,
    scriptContent: script.content,
    sentAt: script.sent_at,
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

  try {
    const result = await runChaserForScript(initialState);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      chaserId: result.chaserId,
      subject: result.emailSubject,
      draft: result.generatedEmail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
