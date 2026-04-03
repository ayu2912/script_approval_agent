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
    .from("briefs")
    .select("*, client:clients(id, name, company, email, brand_voice, platform_focus)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();
  const body = await request.json();

  const allowedFields = [
    "status", "assigned_writer", "content_type", "platform",
    "topic", "target_audience", "key_messages", "tone",
    "reference_links", "deadline", "special_instructions",
    "script_id",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("briefs")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[briefs/PATCH] Update failed:", error.message);
    return NextResponse.json({ error: "Failed to update brief" }, { status: 500 });
  }

  await supabase.from("audit_log").insert({
    entity_type: "brief",
    entity_id: id,
    action: "brief_updated",
    actor: session?.user?.email ?? "team",
    metadata: { fields: Object.keys(updates) },
  });

  return NextResponse.json(data);
}
