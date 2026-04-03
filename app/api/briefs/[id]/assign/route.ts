import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();
  const body = await request.json();

  const { assigned_writer } = body as { assigned_writer: string };

  if (!assigned_writer?.trim()) {
    return NextResponse.json(
      { error: "assigned_writer is required" },
      { status: 400 }
    );
  }

  const { data: brief, error: fetchError } = await supabase
    .from("briefs")
    .select("id, status, client_id")
    .eq("id", id)
    .single();

  if (fetchError || !brief) {
    return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("briefs")
    .update({
      assigned_writer,
      status: "assigned",
      assigned_at: now,
      updated_at: now,
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
    action: "brief_assigned",
    actor: session?.user?.email ?? "team",
    metadata: { assigned_writer },
  });

  return NextResponse.json(updated);
}
