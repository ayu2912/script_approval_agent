import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { runChaserForScript } from "@/lib/agent/graph";
import { Resend } from "resend";
import type { AgentState } from "@/lib/agent/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

async function notifyAgentFailure(scriptId: string, title: string, clientName: string, errorMsg: string) {
  const teamEmail = process.env.TEAM_EMAIL;
  if (!teamEmail || !resend) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    await resend.emails.send({
      from: `Greenlit <${process.env.RESEND_FROM_EMAIL || "greenlit@ruskaruma.me"}>`,
      to: [teamEmail],
      subject: `[Greenlit] Agent failed on script '${title}'`,
      text: `The agent failed to generate a chaser for '${title}' (client: ${clientName}).\n\nError: ${errorMsg}\nScript ID: ${scriptId}\n\nPlease review manually at ${appUrl}/dashboard`,
    });
  } catch (err) {
    console.error("[process-queue] Failure notification email failed:", err);
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  let authorized = false;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    authorized = true;
  }

  if (!authorized) {
    const { error: authError } = await requireSession();
    if (!authError) {
      authorized = true;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase: SupabaseAny = createServiceClientDirect();
  const url = new URL(request.url);
  const specificScriptId = url.searchParams.get("scriptId");

  try {
    let queueItem;

    if (specificScriptId) {
      const { data } = await supabase
        .from("agent_queue")
        .select("id, script_id")
        .eq("script_id", specificScriptId)
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!data) {
        const { data: inserted, error: insertErr } = await supabase
          .from("agent_queue")
          .insert({ script_id: specificScriptId, status: "queued" })
          .select("id, script_id")
          .single();

        if (insertErr) {
          return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }
        queueItem = inserted;
      } else {
        queueItem = data;
      }
    } else {
      const { data, error } = await supabase
        .from("agent_queue")
        .select("id, script_id")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[process-queue] Queue query failed:", error.message);
        return NextResponse.json({ error: "Failed to query processing queue" }, { status: 500 });
      }

      if (!data) {
        return NextResponse.json({ processed: null, remaining: 0 });
      }

      queueItem = data;
    }

    await supabase
      .from("agent_queue")
      .update({ status: "processing" })
      .eq("id", queueItem.id);

    const { data: script, error: scriptErr } = await supabase
      .from("scripts")
      .select("id, title, content, client_id, sent_at, due_date, status, clients(id, name, email)")
      .eq("id", queueItem.script_id)
      .single();

    if (scriptErr || !script) {
      await supabase
        .from("agent_queue")
        .update({ status: "failed", error: "Script not found", processed_at: new Date().toISOString() })
        .eq("id", queueItem.id);
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }

    const client = script.clients;
    if (!client) {
      await supabase
        .from("agent_queue")
        .update({ status: "failed", error: "Client not found", processed_at: new Date().toISOString() })
        .eq("id", queueItem.id);
      return NextResponse.json({ error: "Client not found for script" }, { status: 400 });
    }

    const { data: existingChaser } = await supabase
      .from("chasers")
      .select("id")
      .eq("script_id", script.id)
      .eq("status", "pending_hitl")
      .maybeSingle();

    if (existingChaser) {
      await supabase
        .from("agent_queue")
        .update({ status: "completed", processed_at: new Date().toISOString() })
        .eq("id", queueItem.id);
      return NextResponse.json({ processed: script.id, skipped: true, reason: "chaser_exists" });
    }

    const sentDate = script.sent_at ? new Date(script.sent_at) : new Date();
    const hoursOverdue = Math.round((Date.now() - sentDate.getTime()) / (1000 * 60 * 60));

    const agentState: AgentState = {
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

    try {
      const result = await runChaserForScript(agentState);

      if (result.error) {
        await supabase
          .from("agent_queue")
          .update({ status: "failed", error: result.error, processed_at: new Date().toISOString() })
          .eq("id", queueItem.id);
        await notifyAgentFailure(script.id, script.title, client.name, result.error);
        return NextResponse.json({ processed: script.id, error: result.error });
      }

      await supabase
        .from("agent_queue")
        .update({ status: "completed", processed_at: new Date().toISOString() })
        .eq("id", queueItem.id);

      console.log(`[process-queue] Chaser generated for script ${script.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await supabase
        .from("agent_queue")
        .update({ status: "failed", error: msg, processed_at: new Date().toISOString() })
        .eq("id", queueItem.id);
      await notifyAgentFailure(script.id, script.title, client.name, msg);
      console.error(`[process-queue] Agent failed for script ${script.id}:`, msg);
      return NextResponse.json({ processed: script.id, error: msg });
    }

    const { count } = await supabase
      .from("agent_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued");

    return NextResponse.json({ processed: script.id, remaining: count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Queue processing failed";
    console.error("[process-queue] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
