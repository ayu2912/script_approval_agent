import { NextResponse } from "next/server";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import type { ReportEntry } from "@/lib/supabase/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

const model = new ChatAnthropic({
  model: "claude-haiku-4-5-20251001",
  maxTokens: 1500,
  temperature: 0.5,
});

export async function POST(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const body = await request.json();
  const { report_id } = body;

  if (!report_id) {
    return NextResponse.json({ error: "report_id required" }, { status: 400 });
  }

  const supabase: SupabaseAny = createServiceClientDirect();

  const { data: report, error: reportErr } = await supabase
    .from("reports")
    .select("*, clients(name, email, company)")
    .eq("id", report_id)
    .single();

  if (reportErr || !report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const clientName = report.clients?.name ?? "Client";
  const clientCompany = report.clients?.company ?? "";
  const entries = (report.entries ?? []) as ReportEntry[];
  const aggregate = report.aggregate_metrics as Record<string, Record<string, number>> | null;
  const prevAggregate = report.previous_aggregate as Record<string, Record<string, number>> | null;

  const { data: pastReports } = await supabase
    .from("reports")
    .select("report_title, period_start, period_end, aggregate_metrics, generated_summary")
    .eq("client_id", report.client_id)
    .neq("id", report_id)
    .order("period_end", { ascending: false })
    .limit(3);

  const { data: memories } = await supabase
    .from("client_memories")
    .select("content, memory_type")
    .eq("client_id", report.client_id)
    .order("created_at", { ascending: false })
    .limit(3);

  const entriesText = entries.map((e, i) => {
    const metricsStr = Object.entries(e.metrics).map(([k, v]) => `${k}: ${v}`).join(", ");
    return `${i + 1}. "${e.title}" (${e.platform} ${e.content_type}, posted ${e.post_date})${e.post_url ? ` — ${e.post_url}` : ""}\n   Metrics: ${metricsStr}`;
  }).join("\n");

  let aggregateText = "";
  if (aggregate) {
    const { overall, ...platforms } = aggregate;
    aggregateText = `\nAggregate totals:\nOverall: ${Object.entries(overall).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
    for (const [plat, metrics] of Object.entries(platforms)) {
      aggregateText += `\n${plat}: ${Object.entries(metrics).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
    }
  }

  let prevText = "No previous period data available.";
  if (prevAggregate) {
    const { overall, ...platforms } = prevAggregate;
    prevText = `Previous period aggregate:\nOverall: ${Object.entries(overall).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
    for (const [plat, metrics] of Object.entries(platforms)) {
      prevText += `\n${plat}: ${Object.entries(metrics).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
    }
  }

  const pastReportsContext = (pastReports ?? [])
    .map((r: Record<string, unknown>, i: number) => {
      return `Past report ${i + 1}: "${r.report_title}" (${r.period_start} to ${r.period_end})${r.generated_summary ? `\nSummary: ${(r.generated_summary as string).slice(0, 300)}` : ""}`;
    })
    .join("\n\n");

  const memoriesContext = (memories ?? [])
    .map((m: { content: string; memory_type: string }) => `[${m.memory_type}] ${m.content}`)
    .join("\n");

  const systemPrompt = `You are writing a content performance report for Scrollhouse, a video content agency. This report covers ALL content a client published across ALL their social platforms in a given period.

Rules:
- Never use em dashes. Use commas, full stops, or semicolons instead.
- No filler phrases. No "I hope this finds you well". No "It's worth noting".
- Short sentences. Direct language. Data-driven.
- Oxford comma always.
- Write in second person ("your content", "you gained").
- Match the client's communication style if context is provided.
- Be specific with numbers. Calculate percentages precisely.
- When comparing periods, state exact figures: "Reach rose from 12,400 to 18,600 (+50%)" not "Reach increased significantly".

Output exactly three sections:

PERFORMANCE OVERVIEW:
[3-5 sentences covering aggregate performance across all platforms. Highlight total reach, total engagement, best-performing platform. Call out the top-performing piece of content by name and why it stood out.]

PERIOD COMPARISON:
[If previous period data exists: calculate % changes for key aggregate metrics across platforms. Be specific: "Total views rose from 45,000 to 62,000 (+38%)", "Instagram engagement rate dropped from 4.2% to 3.1%". Flag what improved and what declined per platform. If no previous data, write "This is the first report for this client. No previous period data for comparison."]

RECOMMENDATIONS:
[Exactly 3 specific, actionable recommendations. Each one sentence. Based on what content types, platforms, and formats performed best. Reference specific entries by name where relevant.]`;

  const humanPrompt = `Generate a performance report for:

Client: ${clientName}${clientCompany ? ` (${clientCompany})` : ""}
Report: "${report.report_title}"
Period: ${report.period_start} to ${report.period_end}

Content entries (${entries.length} total):
${entriesText}
${aggregateText}

${prevText}

${pastReportsContext ? `Previous reports:\n${pastReportsContext}` : "No previous reports."}

${memoriesContext ? `Client context:\n${memoriesContext}` : "No prior client context."}`;

  try {
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ]);

    const content = typeof response.content === "string" ? response.content : "";

    const overviewMatch = content.match(/PERFORMANCE OVERVIEW:\s*([\s\S]*?)(?=PERIOD COMPARISON:|$)/i);
    const comparisonMatch = content.match(/PERIOD COMPARISON:\s*([\s\S]*?)(?=RECOMMENDATIONS:|$)/i);
    const recsMatch = content.match(/RECOMMENDATIONS:\s*([\s\S]*?)$/i);

    const overview = overviewMatch ? overviewMatch[1].trim() : content;
    const comparison = comparisonMatch ? comparisonMatch[1].trim() : "";
    const recommendations = recsMatch ? recsMatch[1].trim() : "";

    const fullSummary = comparison
      ? `${overview}\n\n---COMPARISON---\n${comparison}`
      : overview;

    const { error: updateErr } = await supabase
      .from("reports")
      .update({
        generated_summary: fullSummary,
        recommendations,
      })
      .eq("id", report_id);

    if (updateErr) {
      console.error("[reports] Failed to save:", updateErr.message);
    }

    return NextResponse.json({ overview, comparison, recommendations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    console.error("[reports] Claude error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
