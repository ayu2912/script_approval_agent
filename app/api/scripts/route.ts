import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { scoreScript } from "@/lib/scorer/scoreScript";
import type { Script, ScriptWithClient } from "@/lib/supabase/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function GET(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50")));
  const offset = (page - 1) * limit;

  const supabase = createServiceClientDirect();

  const { count, error: countError } = await (supabase as SupabaseAny)
    .from("scripts")
    .select("id", { count: "exact", head: true });

  if (countError) {
    console.error("[scripts/GET] Count query failed:", countError.message);
    return NextResponse.json({ error: "Failed to fetch scripts" }, { status: 500 });
  }

  const { data, error } = await (supabase as SupabaseAny)
    .from("scripts")
    .select("*, client:clients(*)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[scripts/GET] Query failed:", error.message);
    return NextResponse.json({ error: "Failed to fetch scripts" }, { status: 500 });
  }

  return NextResponse.json({
    data: data as ScriptWithClient[],
    total: count ?? 0,
    page,
    limit,
  });
}

export async function POST(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const supabase: SupabaseAny = createServiceClientDirect();
  const body = await request.json();

  const { title, content, client_id, due_date, review_channel, response_deadline_minutes, platform } = body as {
    title: string;
    content: string;
    client_id: string;
    due_date?: string;
    review_channel?: string;
    response_deadline_minutes?: number;
    platform?: string;
  };

  if (!title || !client_id) {
    return NextResponse.json(
      { error: "title and client_id are required" },
      { status: 400 }
    );
  }

  if (!content || !content.trim()) {
    return NextResponse.json(
      { error: "Script content is required. The approval loop cannot function without the script text." },
      { status: 400 }
    );
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("name, email, total_scripts, monthly_volume, whatsapp_number, preferred_channel")
    .eq("id", client_id)
    .single();

  if (clientError) {
    console.error("[scripts/POST] Client lookup failed:", clientError.message);
    return NextResponse.json({ error: "Failed to look up client" }, { status: 500 });
  }

  // Dedup: check for identical title+client within last 60 seconds (double-submit guard)
  // For a proper fix, add a unique index on (client_id, title, status) at the DB level
  const recentCutoff = new Date(Date.now() - 60_000).toISOString();
  const { data: existing } = await supabase
    .from("scripts")
    .select("id, title, status, quality_score, created_at")
    .eq("client_id", client_id)
    .eq("title", title)
    .gte("created_at", recentCutoff)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(existing);
  }

  if (!client.email && !client.whatsapp_number) {
    return NextResponse.json(
      { error: "This client has no email or WhatsApp number. Add contact information before uploading scripts." },
      { status: 400 }
    );
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: script, error: scriptError } = await supabase
    .from("scripts")
    .insert({
      title,
      content,
      client_id,
      status: "draft",
      due_date: due_date ?? null,
      expires_at: expiresAt,
      response_deadline_minutes: response_deadline_minutes ?? 2880,
      sent_at: null,
    })
    .select()
    .single();

  if (scriptError) {
    console.error("[scripts/POST] Insert failed:", scriptError.message);
    return NextResponse.json({ error: "Failed to create script" }, { status: 500 });
  }

  const typedScript = script as Script;

  await supabase
    .from("clients")
    .update({ total_scripts: (client.total_scripts ?? 0) + 1 })
    .eq("id", client_id);

  let qualityScore: Script["quality_score"] = null;
  try {
    qualityScore = await scoreScript({
      content,
      clientId: client_id,
      platform,
      supabase,
    });

    if (qualityScore) {
      await supabase
        .from("scripts")
        .update({ quality_score: qualityScore })
        .eq("id", typedScript.id);
    }
  } catch (err) {
    console.error("[scripts/POST] Scorer failed (non-blocking):", err);
  }

  const quotaWarning = client.monthly_volume && (client.total_scripts ?? 0) >= client.monthly_volume
    ? `Monthly quota reached (${(client.total_scripts ?? 0) + 1}/${client.monthly_volume})`
    : null;

  return NextResponse.json(
    {
      ...typedScript,
      quality_score: qualityScore,
      review_channel: review_channel || client.preferred_channel || "email",
      quota_warning: quotaWarning,
    },
    { status: 201 }
  );
}
