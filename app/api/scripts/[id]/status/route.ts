import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { isValidStatusTransition } from "@/lib/validation";
import type { ScriptStatus } from "@/lib/supabase/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

const validStatuses: ScriptStatus[] = [
  "draft",
  "pending_review",
  "changes_requested",
  "approved",
  "rejected",
  "overdue",
  "closed",
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const { status } = (await request.json()) as { status: ScriptStatus };

  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase: SupabaseAny = createServiceClientDirect();

  const { data: current, error: fetchError } = await supabase
    .from("scripts")
    .select("status")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const oldStatus = current.status as ScriptStatus;

  if (!isValidStatusTransition(oldStatus, status)) {
    return NextResponse.json(
      { error: `Cannot transition from "${oldStatus}" to "${status}"` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("scripts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[scripts/status] Update failed:", error.message);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }

  await supabase.from("audit_log").insert({
    entity_type: "script",
    entity_id: id,
    action: "status_changed",
    actor: session?.user?.email ?? "team_lead",
    metadata: { from: oldStatus, to: status },
  });

  return NextResponse.json({ success: true, status });
}
