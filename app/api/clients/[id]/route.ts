import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();
  const supabase: SupabaseAny = createServiceClientDirect();

  const allowed = [
    "name", "email", "company", "whatsapp_number", "preferred_channel",
    "instagram_handle", "youtube_channel_id", "twitter_handle", "linkedin_url",
    "brand_voice", "account_manager", "contract_start", "monthly_volume",
    "platform_focus",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body && body[key] !== undefined) {
      updates[key] = body[key] === "" ? null : body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("clients")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[clients/PATCH] Update failed:", error.message);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();

  const { count: scriptCount } = await supabase
    .from("scripts")
    .select("id", { count: "exact", head: true })
    .eq("client_id", id);

  const { count: chaserCount } = await supabase
    .from("chasers")
    .select("id", { count: "exact", head: true })
    .eq("client_id", id);

  const deps: string[] = [];
  if ((scriptCount ?? 0) > 0) deps.push(`${scriptCount} scripts`);
  if ((chaserCount ?? 0) > 0) deps.push(`${chaserCount} chasers`);

  if (deps.length > 0) {
    return NextResponse.json(
      { error: `Cannot delete client with dependent records: ${deps.join(", ")}` },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[clients/DELETE] Failed:", error.message);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
