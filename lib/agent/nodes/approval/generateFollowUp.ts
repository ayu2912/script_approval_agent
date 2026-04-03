import { ChatAnthropic } from "@langchain/anthropic";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { sendChaserWhatsApp } from "@/lib/twilio/sendChaserWhatsApp";
import { sendChaserEmail } from "@/lib/resend/sendChaserEmail";
import type { ApprovalState } from "../../approvalTypes";
import type { NodeLogEntry } from "../../types";

const model = new ChatAnthropic({
  model: "claude-haiku-4-5-20251001",
  maxTokens: 300,
  temperature: 0.5,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateFollowUp(
  state: ApprovalState
): Promise<Partial<ApprovalState>> {
  const start = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClientDirect() as any;

  const isSecondFollowUp = state.followUpCount >= 1;
  const newFollowUpCount = state.followUpCount + 1;

  const toneInstruction = isSecondFollowUp
    ? "This is the second follow-up. Production is blocked. Be direct and clear that you need a response urgently, but remain professional. Do not be rude."
    : "This is the first follow-up. Be warm and polite. Assume the client is busy, not ignoring you.";

  const prompt = `You are a content coordinator at Scrollhouse.

Write a follow-up message to ${state.clientName} about the script "${state.scriptTitle}" that was sent for approval and has not received a response.

${toneInstruction}

Guidelines:
- Reference the original approval request
- Remind them the script is awaiting their approval
- Keep under 80 words
- Sound human, not like an automated reminder
- End with a clear ask: approve, request changes, or let us know if you'd like a call

Write only the message body.`;

  const response = await model.invoke([{ role: "user", content: prompt }]);
  const message = (response.content as string).trim();

  // --- Send the follow-up ---
  let sendResult: { success: boolean; error?: string };

  if (state.preferredChannel === "whatsapp" && state.clientWhatsApp) {
    sendResult = await sendChaserWhatsApp({
      to: state.clientWhatsApp,
      clientName: state.clientName,
      draftContent: message,
      subject: `Follow-up: ${state.scriptTitle}`,
    });
  } else {
    sendResult = await sendChaserEmail(
      state.clientEmail,
      message,
      `Follow-up: ${state.scriptTitle}`,
      state.clientName
    );
  }

  const sentAt = new Date().toISOString();
  const newStatus = isSecondFollowUp ? "follow_up_2_sent" : "follow_up_1_sent";

  // --- Update approval_threads ---
  const updatePayload = isSecondFollowUp
    ? {
        status: newStatus,
        follow_up_2_sent_at: sentAt,
        follow_up_2_message: message,
        follow_up_count: newFollowUpCount,
      }
    : {
        status: newStatus,
        follow_up_1_sent_at: sentAt,
        follow_up_1_message: message,
        follow_up_count: newFollowUpCount,
      };

  await supabase
    .from("approval_threads")
    .update(updatePayload)
    .eq("script_id", state.scriptId)
    .eq("script_version", state.scriptVersion);

  // --- Audit log ---
  await supabase.from("audit_log").insert({
    entity_type: "script",
    entity_id: state.scriptId,
    action: isSecondFollowUp ? "follow_up_2_sent" : "follow_up_1_sent",
    actor: "approval_agent",
    metadata: {
      channel: state.preferredChannel,
      send_success: sendResult.success,
      send_error: sendResult.error ?? null,
    },
  });

  const log: NodeLogEntry = {
    node: "generateFollowUp",
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: `Follow-up ${newFollowUpCount} sent to ${state.clientName} (${state.preferredChannel})`,
  };

  return {
    followUpMessage: message,
    followUpCount: newFollowUpCount,
    approvalStatus: newStatus,
    ...(isSecondFollowUp
      ? { followUp2SentAt: sentAt }
      : { followUp1SentAt: sentAt }),
    nodeLog: [log],
  };
}
