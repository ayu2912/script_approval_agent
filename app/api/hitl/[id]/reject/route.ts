import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { resumeChaserGraph } from "@/lib/agent/graph";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data: chaser, error: fetchError } = await supabase
    .from("chasers")
    .select("id, status, script_id")
    .eq("id", id)
    .single();

  if (fetchError || !chaser) {
    return NextResponse.json({ error: "Chaser not found" }, { status: 404 });
  }

  if (chaser.status !== "pending_hitl" && chaser.status !== "draft_saved") {
    return NextResponse.json(
      { error: `Chaser already ${chaser.status}` },
      { status: 409 }
    );
  }

  const { error: updateError } = await supabase
    .from("chasers")
    .update({ status: "rejected" })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const threadId = `chaser-${chaser.script_id}`;
  resumeChaserGraph(threadId, "rejected").catch((err: unknown) =>
    console.error("[hitl/reject] Graph resume failed (non-blocking):", err)
  );

  await supabase.from("audit_log").insert({
    entity_type: "chaser",
    entity_id: id,
    action: "chaser_rejected",
    actor: "team_lead",
    metadata: { script_id: chaser.script_id, thread_id: threadId },
  });

  return NextResponse.json({ success: true });
}
