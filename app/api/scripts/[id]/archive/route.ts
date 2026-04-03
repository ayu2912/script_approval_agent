import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();

  let archived = true;
  try {
    const body = await request.json();
    if (body.archived === false) archived = false;
  } catch {
    // Backwards compatible: no body means archive
  }

  const { error } = await supabase
    .from("scripts")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[archive] DB write failed:", error.message);
    return NextResponse.json({ error: "Failed to update archive status" }, { status: 500 });
  }

  console.log(`[archive] script=${id} archived=${archived} — DB write success`);

  await supabase.from("audit_log").insert({
    entity_type: "script",
    entity_id: id,
    action: archived ? "archived" : "unarchived",
    actor: session?.user?.email ?? "team_lead",
  });

  return NextResponse.json({ success: true, archived });
}
