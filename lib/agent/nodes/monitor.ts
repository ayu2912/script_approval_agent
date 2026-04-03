import { createServiceClientDirect } from "@/lib/supabase/server";
import type { AgentState } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function monitorOverdueScripts(): Promise<AgentState[]> {
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data: scripts, error } = await supabase
    .from("scripts")
    .select("id, title, content, client_id, sent_at, due_date, response_deadline_minutes, clients(id, name, email)")
    .eq("status", "pending_review")
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: true });

  if (error) {
    console.error("[monitor] Failed to query overdue scripts:", error.message);
    return [];
  }

  if (!scripts || scripts.length === 0) return [];

  const nowMs = Date.now();
  const overdueScripts = scripts.filter(
    (s: { sent_at: string; due_date: string | null; response_deadline_minutes: number | null }) => {
      const deadlineMinutes = s.response_deadline_minutes ?? 2880;
      const sentTime = new Date(s.sent_at).getTime();
      const deadlinePassed = sentTime + deadlineMinutes * 60 * 1000 < nowMs;
      const dueDatePassed = s.due_date ? new Date(s.due_date).getTime() < nowMs : false;
      return deadlinePassed || dueDatePassed;
    }
  );

  const recentChaserCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const overdueIds = overdueScripts.map((s: { id: string }) => s.id);
  const { data: recentChasersData } = await supabase
    .from("chasers")
    .select("script_id")
    .in("script_id", overdueIds)
    .gte("created_at", recentChaserCutoff);

  const scriptsWithRecentChaser = new Set(
    (recentChasersData ?? []).map((c: { script_id: string }) => c.script_id)
  );

  const results: AgentState[] = [];
  let skippedRecentChaser = 0;
  let skippedNoClient = 0;

  for (const script of overdueScripts) {
    if (scriptsWithRecentChaser.has(script.id)) {
      skippedRecentChaser++;
      console.log(`[monitor] Skipped "${script.title}" (id=${script.id}): chaser already sent in last 24h`);
      continue;
    }

    const client = script.clients;
    if (!client) {
      skippedNoClient++;
      console.log(`[monitor] Skipped "${script.title}" (id=${script.id}): no client linked`);
      continue;
    }

    const sentDate = new Date(script.sent_at);
    const hoursOverdue = Math.round((Date.now() - sentDate.getTime()) / (1000 * 60 * 60));

    results.push({
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
    });
  }

  const totalOverdue = overdueScripts.length;
  console.log(`[monitor] ${totalOverdue} overdue scripts: ${results.length} need chasers, ${skippedRecentChaser} skipped (recent chaser), ${skippedNoClient} skipped (no client)`);
  return results;
}
