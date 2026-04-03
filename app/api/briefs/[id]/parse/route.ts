import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { parseBrief } from "@/lib/briefs/parseBrief";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data: brief, error: fetchError } = await supabase
    .from("briefs")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !brief) {
    return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  }

  await supabase
    .from("briefs")
    .update({ status: "parsing", updated_at: new Date().toISOString() })
    .eq("id", id);

  try {
    const parsed = await parseBrief({
      rawInput: brief.raw_input,
      contentType: brief.content_type,
      platform: brief.platform,
      topic: brief.topic,
      targetAudience: brief.target_audience,
      keyMessages: brief.key_messages,
      tone: brief.tone,
      referenceLinks: brief.reference_links,
      specialInstructions: brief.special_instructions,
      clientId: brief.client_id,
    });

    const { data: updated, error: updateError } = await supabase
      .from("briefs")
      .update({
        parsed_brief: parsed,
        status: "parsed",
        parsed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await supabase.from("audit_log").insert({
      entity_type: "brief",
      entity_id: id,
      action: "brief_parsed",
      actor: session?.user?.email ?? "ai",
      metadata: { title: parsed.title },
    });

    return NextResponse.json(updated);
  } catch (err) {
    await supabase
      .from("briefs")
      .update({ status: "intake", updated_at: new Date().toISOString() })
      .eq("id", id);

    console.error("[briefs/parse] AI parsing failed:", err);
    return NextResponse.json(
      { error: "AI parsing failed. Please try again." },
      { status: 500 }
    );
  }
}
