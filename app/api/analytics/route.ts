import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function GET(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const supabase: SupabaseAny = createServiceClientDirect();
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const rangeDays = url.searchParams.get("range") || "30";
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "200", 10) || 200, 1), 1000);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

  const cutoffDate = rangeDays === "all" ? null : new Date(Date.now() - parseInt(rangeDays) * 86400000).toISOString();

  let query = supabase.from("scripts").select("id, title, status, client_id, sent_at, reviewed_at, due_date, created_at, quality_score, clients(id, name, company)");
  if (clientId) query = query.eq("client_id", clientId);
  if (cutoffDate) query = query.gte("created_at", cutoffDate);
  const { data: scripts } = await query.order("created_at", { ascending: true }).range(offset, offset + limit - 1);

  let chaserQuery = supabase.from("chasers").select("id, script_id, status, created_at");
  if (cutoffDate) chaserQuery = chaserQuery.gte("created_at", cutoffDate);
  const { data: chasers } = await chaserQuery;

  const scriptIds = new Set((scripts ?? []).map((s: { id: string }) => s.id));
  const filteredChasers = clientId
    ? (chasers ?? []).filter((c: { script_id: string }) => scriptIds.has(c.script_id))
    : (chasers ?? []);

  const allScripts = (scripts ?? []) as { id: string; title: string; status: string; client_id: string; sent_at: string | null; reviewed_at: string | null; due_date: string | null; created_at: string; quality_score: { average?: number } | null; clients: { id: string; name: string; company: string | null } }[];

  const pending = allScripts.filter(s => s.status === "pending_review" || s.status === "overdue").length;
  const chasersSent = filteredChasers.filter((c: { status: string }) => c.status === "sent").length;

  const approvedWithTimes = allScripts.filter(s => s.status === "approved" && s.sent_at && s.reviewed_at);
  let avgApprovalHours: number | null = null;
  if (approvedWithTimes.length > 0) {
    const totalHours = approvedWithTimes.reduce((sum, s) => {
      return sum + (new Date(s.reviewed_at!).getTime() - new Date(s.sent_at!).getTime()) / 3600000;
    }, 0);
    avgApprovalHours = Math.round((totalHours / approvedWithTimes.length) * 10) / 10;
  }

  const nonDraft = allScripts.filter(s => s.status !== "draft");
  const approved = allScripts.filter(s => s.status === "approved").length;
  const approvalRate = nonDraft.length > 0 ? Math.round((approved / nonDraft.length) * 100) : null;

  const statusCounts: Record<string, number> = {};
  for (const s of allScripts) {
    statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;
  }

  const timelineMap = new Map<string, { date: string; created: number; approved: number }>();
  for (const s of allScripts) {
    const d = new Date(s.created_at);
    const dayOfWeek = d.getDay();
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const weekStart = new Date(d);
    weekStart.setDate(diff);
    const key = weekStart.toISOString().split("T")[0];

    if (!timelineMap.has(key)) {
      timelineMap.set(key, { date: key, created: 0, approved: 0 });
    }
    const entry = timelineMap.get(key)!;
    entry.created++;
    if (s.status === "approved") entry.approved++;
  }
  const timeline = [...timelineMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const tableData = allScripts.map(s => {
    const chaserCount = filteredChasers.filter((c: { script_id: string; status: string }) => c.script_id === s.id && c.status === "sent").length;
    let approvalTime: number | null = null;
    if (s.sent_at && s.reviewed_at) {
      approvalTime = Math.round((new Date(s.reviewed_at).getTime() - new Date(s.sent_at).getTime()) / 3600000 * 10) / 10;
    }
    return {
      id: s.id,
      title: s.title,
      clientName: s.clients?.name ?? "Unknown",
      status: s.status,
      qualityScore: s.quality_score?.average ?? null,
      sentAt: s.sent_at,
      approvalTime,
      chasersSent: chaserCount,
    };
  });

  const { data: clients } = await supabase.from("clients").select("id, name").order("name", { ascending: true });

  return NextResponse.json({
    kpis: { pending, avgApprovalHours, chasersSent, approvalRate },
    statusDistribution: statusCounts,
    timeline,
    scripts: tableData,
    clients: clients ?? [],
  });
}
