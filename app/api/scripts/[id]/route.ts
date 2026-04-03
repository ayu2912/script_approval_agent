import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();
  const body = await request.json();

  const { content, title } = body as { content?: string; title?: string };

  if (!content && !title) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data: script, error: fetchError } = await supabase
    .from("scripts")
    .select("id, status, content, title")
    .eq("id", id)
    .single();

  if (fetchError || !script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (content) update.content = content;
  if (title) update.title = title;

  const { error: updateError } = await supabase
    .from("scripts")
    .update(update)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("audit_log").insert({
    entity_type: "script",
    entity_id: id,
    action: "script_edited",
    actor: "team_lead",
    metadata: {
      fields_updated: Object.keys(update).filter((k) => k !== "updated_at"),
      old_status: script.status,
    },
  });

  return NextResponse.json({ success: true });
}
