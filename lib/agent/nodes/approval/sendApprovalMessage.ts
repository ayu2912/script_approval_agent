import { createServiceClientDirect } from "@/lib/supabase/server";
import { sendChaserWhatsApp } from "@/lib/twilio/sendChaserWhatsApp";
import { sendChaserEmail } from "@/lib/resend/sendChaserEmail";
import type { ApprovalState } from "../../approvalTypes";
import type { NodeLogEntry } from "../../types";

export async function sendApprovalMessage(
  state: ApprovalState
): Promise<Partial<ApprovalState>> {
  const start = Date.now();

  if (!state.approvalRequestMessage) {
    return { error: "sendApprovalMessage: No message to send" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClientDirect() as any;
  const threadId = `approval-${state.scriptId}-v${state.scriptVersion}`;
  const sentAt = new Date().toISOString();

  // --- Send via preferred channel ---
  let sendResult: { success: boolean; error?: string };

  if (
    state.preferredChannel === "whatsapp" &&
    state.clientWhatsApp
  ) {
    sendResult = await sendChaserWhatsApp({
      to: state.clientWhatsApp,
      clientName: state.clientName,
      draftContent: state.approvalRequestMessage,
      subject: `Script Approval: ${state.scriptTitle}`,
    });
  } else {
    sendResult = await sendChaserEmail(
      state.clientEmail,
      state.approvalRequestMessage,
      `Script Approval Request: ${state.scriptTitle}`,
      state.clientName
    );
  }

  if (!sendResult.success) {
    return { error: `sendApprovalMessage: ${sendResult.error}` };
  }

  // --- Create approval_threads record ---
  const { error: threadError } = await supabase
    .from("approval_threads")
    .upsert(
      {
        script_id: state.scriptId,
        client_id: state.clientId,
        status: "request_sent",
        preferred_channel: state.preferredChannel,
        script_version: state.scriptVersion,
        request_sent_at: sentAt,
        request_message: state.approvalRequestMessage,
        langgraph_thread_id: threadId,
        follow_up_count: 0,
      },
      { onConflict: "script_id,script_version" }
    );

  if (threadError) {
    console.error("[sendApprovalMessage] Failed to create thread:", threadError.message);
  }

  // --- Update script status to pending_review ---
  await supabase
    .from("scripts")
    .update({ status: "pending_review" })
    .eq("id", state.scriptId);

  // --- Audit log ---
  await supabase.from("audit_log").insert({
    entity_type: "script",
    entity_id: state.scriptId,
    action: "approval_request_sent",
    actor: "approval_agent",
    metadata: {
      channel: state.preferredChannel,
      client: state.clientName,
      script_title: state.scriptTitle,
      thread_id: threadId,
    },
  });

  const log: NodeLogEntry = {
    node: "sendApprovalMessage",
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: `Sent via ${state.preferredChannel} to ${state.clientName}`,
  };

  return {
    threadId,
    requestSentAt: sentAt,
    approvalStatus: "request_sent",
    nodeLog: [log],
  };
}
