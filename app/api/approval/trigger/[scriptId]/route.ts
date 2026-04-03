import { NextRequest, NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { startApprovalFlow } from "@/lib/agent/approvalGraph";

// POST /api/approval/trigger/[scriptId]
// Called when a scriptwriter marks a script as "Ready for Approval"
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  const { scriptId } = await params;

  if (!scriptId) {
    return NextResponse.json({ error: "scriptId is required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClientDirect() as any;

  // --- Validate script exists and is in a triggerable state ---
  const { data: script, error: scriptError } = await supabase
    .from("scripts")
    .select("id, title, status, client_id")
    .eq("id", scriptId)
    .single();

  if (scriptError || !script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  if (script.status === "approved" || script.status === "closed") {
    return NextResponse.json(
      { error: `Script is already ${script.status}` },
      { status: 400 }
    );
  }

  // --- Check no active approval thread already exists for this script ---
  const { data: existingThread } = await supabase
    .from("approval_threads")
    .select("id, status")
    .eq("script_id", scriptId)
    .not("status", "in", '("approved","rejected","escalated")')
    .maybeSingle();

  if (existingThread) {
    return NextResponse.json(
      {
        error: "An active approval thread already exists for this script",
        threadStatus: existingThread.status,
      },
      { status: 409 }
    );
  }

  // --- Start the LangGraph approval flow ---
  const result = await startApprovalFlow(scriptId);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Failed to start approval flow" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    scriptId,
    threadId: result.threadId,
    message: `Approval flow started for "${script.title}"`,
  });
}
