import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { sendReportEmail } from "@/lib/resend/sendReportEmail";
import type { ReportEntry, AggregateMetrics } from "@/lib/supabase/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data: report, error: fetchErr } = await supabase
    .from("reports")
    .select("*, clients(name, email, company)")
    .eq("id", id)
    .single();

  if (fetchErr || !report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  if (!report.generated_summary) {
    return NextResponse.json({ error: "Generate the report first" }, { status: 400 });
  }

  const clientEmail = report.clients?.email;
  if (!clientEmail) {
    return NextResponse.json({ error: "Client has no email" }, { status: 400 });
  }

  const storedSummary = report.generated_summary as string;
  const parts = storedSummary.split("\n\n---COMPARISON---\n");
  const overview = parts[0] ?? storedSummary;
  const comparison = parts[1] ?? "";

  const result = await sendReportEmail({
    to: clientEmail,
    clientName: report.clients?.name ?? "Client",
    reportTitle: report.report_title as string,
    periodStart: report.period_start as string,
    periodEnd: report.period_end as string,
    entries: report.entries as ReportEntry[],
    aggregate: report.aggregate_metrics as AggregateMetrics | null,
    previousAggregate: report.previous_aggregate as AggregateMetrics | null,
    overview,
    comparison,
    recommendations: report.recommendations ?? "",
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Email failed" }, { status: 500 });
  }

  await supabase
    .from("reports")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", id);

  await supabase.from("audit_log").insert({
    entity_type: "report",
    entity_id: id,
    action: "report_sent",
    actor: "team_lead",
    metadata: { client_email: clientEmail, entry_count: (report.entries as ReportEntry[]).length },
  });

  return NextResponse.json({ success: true });
}
