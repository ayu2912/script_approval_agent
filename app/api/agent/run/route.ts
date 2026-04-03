import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode");

  let isCron = false;
  let authorized = false;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    authorized = true;
    isCron = true;
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

  const mode = modeParam === "full" ? "full"
    : modeParam === "scan" ? "scan"
    : isCron ? "full" : "scan";

  const supabase: SupabaseAny = createServiceClientDirect();

  try {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const { data: candidates, error: queryError } = await supabase
      .from("scripts")
      .select("id, title, sent_at, due_date, response_deadline_minutes")
      .eq("status", "pending_review")
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: true });

    if (queryError) {
      console.error("[agent/run] Overdue query failed:", queryError.message);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    const overdueScripts = (candidates ?? []).filter(
      (s: { sent_at: string; due_date: string | null; response_deadline_minutes: number | null }) => {
        const deadlineMinutes = s.response_deadline_minutes ?? 2880;
        const sentTime = new Date(s.sent_at).getTime();
        const deadlinePassed = sentTime + deadlineMinutes * 60 * 1000 < nowMs;
        const dueDatePassed = s.due_date ? new Date(s.due_date).getTime() < nowMs : false;
        return deadlinePassed || dueDatePassed;
      }
    );

    if (overdueScripts.length === 0) {
      console.log("[agent/run] No overdue scripts found");
      return NextResponse.json({ updated: 0, scriptIds: [], mode });
    }

    const scriptIds = overdueScripts.map((s: { id: string }) => s.id);
    console.log(`[agent/run] Found ${scriptIds.length} overdue scripts: ${scriptIds.join(", ")}`);

    const { error: updateError } = await supabase
      .from("scripts")
      .update({ status: "overdue", updated_at: new Date().toISOString() })
      .in("id", scriptIds);

    if (updateError) {
      console.error("[agent/run] Batch update failed:", updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (mode === "scan") {
      return NextResponse.json({
        updated: scriptIds.length,
        scriptIds,
        mode: "scan",
      });
    }

    const { data: alreadyQueued } = await supabase
      .from("agent_queue")
      .select("script_id")
      .in("script_id", scriptIds)
      .eq("status", "queued");

    const alreadyQueuedIds = new Set((alreadyQueued ?? []).map((r: { script_id: string }) => r.script_id));
    const newScriptIds = scriptIds.filter((id: string) => !alreadyQueuedIds.has(id));

    if (newScriptIds.length === 0) {
      return NextResponse.json({
        updated: scriptIds.length,
        scriptIds,
        mode: "full",
        queued: 0,
        skipped: scriptIds.length,
      });
    }

    const queueRows = newScriptIds.map((id: string) => ({
      script_id: id,
      status: "queued",
    }));

    const { error: queueError } = await supabase
      .from("agent_queue")
      .insert(queueRows);

    if (queueError) {
      console.error("[agent/run] Queue insert failed:", queueError.message);
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }

    console.log(`[agent/run] Queued ${newScriptIds.length} scripts for agent processing (${alreadyQueuedIds.size} already queued)`);

    return NextResponse.json({
      updated: scriptIds.length,
      scriptIds,
      mode: "full",
      queued: newScriptIds.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent run failed";
    console.error("[agent/run] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
