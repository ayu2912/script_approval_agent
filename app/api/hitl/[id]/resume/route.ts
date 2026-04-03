import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { resumeChaserGraph } from "@/lib/agent/graph";
import { storeFewShotExample } from "@/lib/agent/fewShot";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();

  let body: { action: "approved" | "edited" | "rejected"; editedContent?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { action, editedContent } = body;

  if (!["approved", "edited", "rejected"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: chaser, error: fetchError } = await supabase
    .from("chasers")
    .select("id, script_id, client_id, draft_content, status, scripts(title)")
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

  const threadId = `chaser-${chaser.script_id}`;

  const wasEdited = editedContent != null && editedContent !== chaser.draft_content;
  if (wasEdited && (action === "approved" || action === "edited")) {
    storeFewShotExample({
      clientId: chaser.client_id,
      chaserId: chaser.id,
      originalDraft: chaser.draft_content,
      editedDraft: editedContent!,
      scriptTitle: chaser.scripts?.title ?? null,
    }).catch((err: unknown) =>
      console.error("[hitl/resume] Few-shot storage failed:", err)
    );
  }

  const result = await resumeChaserGraph(
    threadId,
    wasEdited ? "edited" : action,
    editedContent
  );

  if (!result.success) {
    console.error("[hitl/resume] Graph resume failed:", result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await supabase.from("audit_log").insert({
    entity_type: "chaser",
    entity_id: id,
    action: `chaser_${action}_via_resume`,
    actor: "team_lead",
    metadata: {
      script_id: chaser.script_id,
      was_edited: wasEdited,
      thread_id: threadId,
    },
  });

  return NextResponse.json({ success: true, action, threadId });
}
