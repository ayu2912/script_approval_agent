import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function GET(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

  const supabase: SupabaseAny = createServiceClientDirect();

  const { data, error } = await supabase
    .from("briefs")
    .select("*, client:clients(id, name, company, email)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[briefs/GET] Query failed:", error.message);
    return NextResponse.json({ error: "Failed to fetch briefs" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const { session, error: authError } = await requireSession();
  if (authError) return authError;

  const supabase: SupabaseAny = createServiceClientDirect();
  const body = await request.json();

  const {
    client_id,
    raw_input,
    content_type,
    platform,
    topic,
    target_audience,
    key_messages,
    tone,
    reference_links,
    deadline,
    special_instructions,
  } = body as {
    client_id: string;
    raw_input: string;
    content_type: string;
    platform?: string;
    topic?: string;
    target_audience?: string;
    key_messages?: string;
    tone?: string;
    reference_links?: string;
    deadline?: string;
    special_instructions?: string;
  };

  if (!client_id || !raw_input?.trim()) {
    return NextResponse.json(
      { error: "client_id and raw_input are required" },
      { status: 400 }
    );
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", client_id)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { data: brief, error: insertError } = await supabase
    .from("briefs")
    .insert({
      client_id,
      raw_input,
      content_type: content_type || "video_script",
      platform: platform || null,
      topic: topic || null,
      target_audience: target_audience || null,
      key_messages: key_messages || null,
      tone: tone || null,
      reference_links: reference_links || null,
      deadline: deadline || null,
      special_instructions: special_instructions || null,
      status: "intake",
    })
    .select()
    .single();

  if (insertError) {
    console.error("[briefs/POST] Insert failed:", insertError.message);
    return NextResponse.json({ error: "Failed to create brief" }, { status: 500 });
  }

  await supabase.from("audit_log").insert({
    entity_type: "brief",
    entity_id: brief.id,
    action: "brief_created",
    actor: session?.user?.email ?? "team",
    metadata: { client_name: client.name, content_type },
  });

  return NextResponse.json(brief, { status: 201 });
}
