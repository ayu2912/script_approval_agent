import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import type { ReportEntry } from "@/lib/supabase/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

function computeAggregate(entries: ReportEntry[]) {
  const perPlatform: Record<string, Record<string, number>> = {};
  const overall: Record<string, number> = { entry_count: entries.length };

  for (const entry of entries) {
    if (!perPlatform[entry.platform]) perPlatform[entry.platform] = { entry_count: 0 };
    perPlatform[entry.platform].entry_count++;

    for (const [key, value] of Object.entries(entry.metrics)) {
      // Rates must be averaged, not summed
      const isRate = key.includes("rate") || key === "ctr";
      if (isRate) {
        const countKey = `_${key}_sum`;
        const nKey = `_${key}_n`;
        perPlatform[entry.platform][countKey] = (perPlatform[entry.platform][countKey] ?? 0) + value;
        perPlatform[entry.platform][nKey] = (perPlatform[entry.platform][nKey] ?? 0) + 1;
        overall[countKey] = (overall[countKey] ?? 0) + value;
        overall[nKey] = (overall[nKey] ?? 0) + 1;
      } else {
        perPlatform[entry.platform][key] = (perPlatform[entry.platform][key] ?? 0) + value;
        overall[key] = (overall[key] ?? 0) + value;
      }
    }
  }

  const resolveRates = (obj: Record<string, number>) => {
    const keys = Object.keys(obj).filter((k) => k.startsWith("_") && k.endsWith("_sum"));
    for (const sumKey of keys) {
      const baseKey = sumKey.slice(1, -4);
      const nKey = `_${baseKey}_n`;
      if (obj[nKey] > 0) {
        obj[baseKey] = Math.round((obj[sumKey] / obj[nKey]) * 100) / 100;
      }
      delete obj[sumKey];
      delete obj[nKey];
    }
  };

  resolveRates(overall);
  for (const p of Object.keys(perPlatform)) resolveRates(perPlatform[p]);

  return { overall, ...perPlatform };
}

export async function GET(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

  const supabase: SupabaseAny = createServiceClientDirect();

  const { data, error } = await supabase
    .from("reports")
    .select("*, clients(name, email, company)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[reports/GET] Query failed:", error.message);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }

  const reports = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    client: row.clients,
  }));

  return NextResponse.json({ reports });
}

export async function POST(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const body = await request.json();
  const { client_id, report_title, period_start, period_end, entries } = body;

  if (!client_id || !report_title || !period_start || !period_end || !entries || !Array.isArray(entries)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const startDate = new Date(period_start);
  const endDate = new Date(period_end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format for period_start or period_end" }, { status: 400 });
  }
  if (startDate >= endDate) {
    return NextResponse.json({ error: "period_start must be before period_end" }, { status: 400 });
  }
  if (endDate > new Date()) {
    return NextResponse.json({ error: "period_end cannot be in the future" }, { status: 400 });
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: "At least one content entry is required" }, { status: 400 });
  }

  const aggregate = computeAggregate(entries as ReportEntry[]);

  const supabase: SupabaseAny = createServiceClientDirect();

  const { data: prevReport } = await supabase
    .from("reports")
    .select("aggregate_metrics")
    .eq("client_id", client_id)
    .order("period_end", { ascending: false })
    .limit(1)
    .single();

  const previous_aggregate = prevReport?.aggregate_metrics ?? null;

  const { data, error } = await supabase
    .from("reports")
    .insert({
      client_id,
      report_title,
      period_start,
      period_end,
      entries,
      aggregate_metrics: aggregate,
      previous_aggregate,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[reports/POST] Insert failed:", error.message);
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
  }

  return NextResponse.json({ report: data });
}
