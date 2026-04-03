import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function GET() {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const supabase: SupabaseAny = createServiceClientDirect();
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();

  const [{ data: scripts }, { data: chasers }] = await Promise.all([
    supabase
      .from("scripts")
      .select("status, created_at, sent_at, reviewed_at")
      .gte("created_at", cutoff),
    supabase
      .from("chasers")
      .select("status, created_at")
      .eq("status", "sent")
      .gte("created_at", cutoff),
  ]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    return d.toISOString().split("T")[0];
  });

  const pending: { day: string; value: number }[] = [];
  const approvalHours: { day: string; value: number }[] = [];
  const chaserCounts: { day: string; value: number }[] = [];
  const approvals: { day: string; value: number }[] = [];

  for (const day of days) {
    const dayScripts = (scripts ?? []).filter(
      (s: { created_at: string }) => s.created_at.split("T")[0] === day
    );
    pending.push({
      day,
      value: dayScripts.filter(
        (s: { status: string }) =>
          s.status === "pending_review" || s.status === "overdue"
      ).length,
    });

    const approvedToday = (scripts ?? []).filter(
      (s: { status: string; reviewed_at: string | null }) =>
        s.status === "approved" &&
        s.reviewed_at &&
        s.reviewed_at.split("T")[0] === day
    );
    approvals.push({ day, value: approvedToday.length });

    const withTimes = approvedToday.filter(
      (s: { sent_at: string | null }) => s.sent_at
    );
    let avg = 0;
    if (withTimes.length > 0) {
      const total = withTimes.reduce(
        (sum: number, s: { sent_at: string; reviewed_at: string }) =>
          sum +
          (new Date(s.reviewed_at).getTime() -
            new Date(s.sent_at).getTime()) /
            3600000,
        0
      );
      avg = Math.round((total / withTimes.length) * 10) / 10;
    }
    approvalHours.push({ day, value: avg });

    chaserCounts.push({
      day,
      value: (chasers ?? []).filter(
        (c: { created_at: string }) => c.created_at.split("T")[0] === day
      ).length,
    });
  }

  return NextResponse.json({
    pending,
    approvalHours,
    chasers: chaserCounts,
    approvals,
  });
}
