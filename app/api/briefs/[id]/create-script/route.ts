import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import type { ParsedBrief } from "@/lib/briefs/parseBrief";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

function buildContentFromBrief(parsed: ParsedBrief): string {
  const lines: string[] = [];

  if (parsed.title) lines.push(`Title: ${parsed.title}\n`);
  if (parsed.hook_angle) lines.push(`Hook: ${parsed.hook_angle}\n`);
  if (parsed.core_message) lines.push(`Core Message: ${parsed.core_message}\n`);

  if (parsed.key_talking_points?.length > 0) {
    lines.push("Key Talking Points:");
    parsed.key_talking_points.forEach((p, i) => {
      lines.push(`${i + 1}. ${p}`);
    });
    lines.push("");
  }

  if (parsed.cta) lines.push(`CTA: ${parsed.cta}\n`);
  if (parsed.tone_direction) lines.push(`Tone: ${parsed.tone_direction}\n`);
  if (parsed.writer_notes) lines.push(`[Writer Notes: ${parsed.writer_notes}]`);

  return lines.join("\n").trim();
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data: brief, error: briefError } = await supabase
    .from("briefs")
    .select("*, client:clients(id, name, email)")
    .eq("id", id)
    .single();

  if (briefError || !brief) {
    return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  }

  if (brief.status !== "assigned" && brief.status !== "in_progress") {
    return NextResponse.json(
      { error: `Brief must be assigned or in progress to create a script (current: ${brief.status})` },
      { status: 409 }
    );
  }

  if (brief.script_id) {
    return NextResponse.json(
      { error: "Brief already has a linked script" },
      { status: 409 }
    );
  }

  const parsed = brief.parsed_brief as ParsedBrief | null;
  const title = parsed?.title || brief.topic || "Untitled Script";
  const content = parsed
    ? buildContentFromBrief(parsed)
    : brief.raw_input || "";

  const { data: script, error: scriptError } = await supabase
    .from("scripts")
    .insert({
      title,
      content,
      client_id: brief.client_id,
      status: "draft",
      review_token: crypto.randomUUID(),
      platform: brief.platform || null,
      assigned_writer: brief.assigned_writer || null,
      brief_id: brief.id,
    })
    .select()
    .single();

  if (scriptError) {
    return NextResponse.json({ error: scriptError.message }, { status: 500 });
  }

  await supabase
    .from("briefs")
    .update({
      script_id: script.id,
      status: "script_uploaded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await supabase.from("audit_log").insert({
    entity_type: "script",
    entity_id: script.id,
    action: "script_created_from_brief",
    actor: session?.user?.email ?? "team",
    metadata: { brief_id: id },
  });

  return NextResponse.json(script);
}
