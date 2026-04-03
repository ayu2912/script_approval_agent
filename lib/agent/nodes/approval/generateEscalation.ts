import { ChatAnthropic } from "@langchain/anthropic";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { sendChaserEmail } from "@/lib/resend/sendChaserEmail";
import type { ApprovalState } from "../../approvalTypes";
import type { NodeLogEntry } from "../../types";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-6",
  maxTokens: 500,
  temperature: 0.3,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateEscalation(
  state: ApprovalState
): Promise<Partial<ApprovalState>> {
  const start = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClientDirect() as any;

  const requestSentDate = state.requestSentAt
    ? new Date(state.requestSentAt).toLocaleString()
    : "Unknown";
  const fu1Date = state.followUp1SentAt
    ? new Date(state.followUp1SentAt).toLocaleString()
    : "Not sent";
  const fu2Date = state.followUp2SentAt
    ? new Date(state.followUp2SentAt).toLocaleString()
    : "Not sent";

  const prompt = `You are writing an escalation brief for an account manager at Scrollhouse, a content agency.

A client has not responded to a script approval request after 72 hours and two follow-ups. Production is blocked.

Details:
- Client: ${state.clientName} (${state.clientEmail})
- Script: "${state.scriptTitle}"
- Approval request sent: ${requestSentDate}
- Follow-up 1 sent: ${fu1Date}
- Follow-up 2 sent: ${fu2Date}
- Channel used: ${state.preferredChannel}

Write a brief escalation summary (max 150 words) for the account manager that:
1. States the situation clearly in the first sentence
2. Lists the timeline of contact attempts
3. States what is blocked (production cannot start without approval)
4. Suggests a specific next action (call the client directly, check if contact details are correct, etc.)

Be direct. The account manager needs to act immediately.`;

  const response = await model.invoke([{ role: "user", content: prompt }]);
  const escalationMessage = (response.content as string).trim();

  const escalatedAt = new Date().toISOString();

  // --- Send escalation email to account manager ---
  if (state.accountManagerEmail) {
    await sendChaserEmail(
      state.accountManagerEmail,
      escalationMessage,
      `ACTION REQUIRED: ${state.clientName} — Script Approval Overdue (72h)`,
      state.accountManagerName
    );
  }

  // --- Update approval_threads ---
  await supabase
    .from("approval_threads")
    .update({
      status: "escalated",
      escalated_at: escalatedAt,
      escalation_message: escalationMessage,
    })
    .eq("script_id", state.scriptId)
    .eq("script_version", state.scriptVersion);

  // --- Update script status ---
  await supabase
    .from("scripts")
    .update({ status: "escalated" })
    .eq("id", state.scriptId);

  // --- Audit log ---
  await supabase.from("audit_log").insert({
    entity_type: "script",
    entity_id: state.scriptId,
    action: "approval_escalated",
    actor: "approval_agent",
    metadata: {
      client: state.clientName,
      account_manager: state.accountManagerEmail,
      escalated_at: escalatedAt,
      follow_up_count: state.followUpCount,
    },
  });

  const log: NodeLogEntry = {
    node: "generateEscalation",
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: `Escalated to ${state.accountManagerName} — ${state.clientName} unresponsive after 72h`,
  };

  return {
    escalationMessage,
    approvalStatus: "escalated",
    nodeLog: [log],
  };
}
