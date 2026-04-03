import { createServiceClientDirect } from "@/lib/supabase/server";
import { sendChaserEmail } from "@/lib/resend/sendChaserEmail";
import { OpenAIEmbeddings } from "@langchain/openai";
import type { ApprovalState } from "../../approvalTypes";
import type { NodeLogEntry } from "../../types";

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  openAIApiKey: process.env.OPENAI_API_KEY,
});

export async function resolveApproval(
  state: ApprovalState
): Promise<Partial<ApprovalState>> {
  const start = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClientDirect() as any;

  const classification = state.responseClassification;
  const resolvedAt = new Date().toISOString();
  let finalStatus = state.approvalStatus;
  let summary = "";

  // ── APPROVED ─────────────────────────────────────────────────────────────
  if (classification === "approved" || classification === "partial_approval") {
    finalStatus = "approved";

    await supabase
      .from("scripts")
      .update({ status: "approved", client_feedback: state.clientResponse })
      .eq("id", state.scriptId);

    await supabase
      .from("approval_threads")
      .update({
        status: "approved",
        client_response: state.clientResponse,
        response_classification: classification,
        approved_sections: state.approvedSections,
        revision_notes: state.revisionNotes ?? null,
        resolved_at: resolvedAt,
      })
      .eq("script_id", state.scriptId)
      .eq("script_version", state.scriptVersion);

    // Notify scriptwriter via email
    if (state.accountManagerEmail) {
      await sendChaserEmail(
        state.accountManagerEmail,
        `Great news — ${state.clientName} has approved the script "${state.scriptTitle}".\n\n${state.approvedSections ? `Approved sections:\n${state.approvedSections}` : "Full script approved."}\n\nScript is ready to move to production.`,
        `Script Approved: ${state.scriptTitle}`,
        state.accountManagerName
      );
    }

    summary = `Script "${state.scriptTitle}" APPROVED by ${state.clientName}`;

  // ── REVISION REQUESTED ───────────────────────────────────────────────────
  } else if (classification === "revision_requested") {
    finalStatus = "revision_requested";

    await supabase
      .from("scripts")
      .update({
        status: "pending_review",
        client_feedback: state.clientResponse,
      })
      .eq("id", state.scriptId);

    await supabase
      .from("approval_threads")
      .update({
        status: "revision_requested",
        client_response: state.clientResponse,
        response_classification: "revision_requested",
        revision_notes: state.revisionNotes,
        resolved_at: resolvedAt,
      })
      .eq("script_id", state.scriptId)
      .eq("script_version", state.scriptVersion);

    // Notify scriptwriter with revision notes
    if (state.accountManagerEmail) {
      const notificationBody = [
        `${state.clientName} has requested revisions for "${state.scriptTitle}".`,
        ``,
        `Client's exact feedback:`,
        `"${state.clientResponse}"`,
        ``,
        `Extracted revision notes:`,
        state.revisionNotes ?? "See client feedback above.",
      ].join("\n");

      await sendChaserEmail(
        state.accountManagerEmail,
        notificationBody,
        `Revision Requested: ${state.scriptTitle}`,
        state.accountManagerName
      );
    }

    summary = `Revision requested by ${state.clientName} — notes extracted and scriptwriter notified`;

  // ── REJECTED ─────────────────────────────────────────────────────────────
  } else if (classification === "rejected") {
    finalStatus = "rejected";

    await supabase
      .from("scripts")
      .update({
        status: "escalated",
        client_feedback: state.clientResponse,
      })
      .eq("id", state.scriptId);

    await supabase
      .from("approval_threads")
      .update({
        status: "rejected",
        client_response: state.clientResponse,
        response_classification: "rejected",
        rejection_reason: state.rejectionReason,
        resolved_at: resolvedAt,
      })
      .eq("script_id", state.scriptId)
      .eq("script_version", state.scriptVersion);

    if (state.accountManagerEmail) {
      await sendChaserEmail(
        state.accountManagerEmail,
        `${state.clientName} has rejected the script "${state.scriptTitle}".\n\nReason: ${state.rejectionReason ?? state.clientResponse}\n\nPlease review and follow up directly.`,
        `Script Rejected: ${state.scriptTitle}`,
        state.accountManagerName
      );
    }

    summary = `Script rejected by ${state.clientName} — escalated to account manager`;

  // ── CALL REQUESTED ───────────────────────────────────────────────────────
  } else if (classification === "call_requested") {
    finalStatus = "call_requested";

    await supabase
      .from("approval_threads")
      .update({
        status: "call_requested",
        client_response: state.clientResponse,
        response_classification: "call_requested",
        is_paused: true,
      })
      .eq("script_id", state.scriptId)
      .eq("script_version", state.scriptVersion);

    if (state.accountManagerEmail) {
      await sendChaserEmail(
        state.accountManagerEmail,
        `${state.clientName} has requested a call to discuss the script "${state.scriptTitle}" before approving.\n\nPlease schedule a call. Automated follow-ups have been paused.`,
        `Call Requested: ${state.scriptTitle}`,
        state.accountManagerName
      );
    }

    summary = `${state.clientName} requested a call — follow-ups paused, AM notified`;

  // ── AMBIGUOUS ────────────────────────────────────────────────────────────
  } else {
    await supabase
      .from("approval_threads")
      .update({
        client_response: state.clientResponse,
        response_classification: "ambiguous",
      })
      .eq("script_id", state.scriptId)
      .eq("script_version", state.scriptVersion);

    if (state.accountManagerEmail) {
      await sendChaserEmail(
        state.accountManagerEmail,
        `${state.clientName} replied to the script approval for "${state.scriptTitle}" but the intent is unclear.\n\nTheir response: "${state.clientResponse}"\n\nPlease review and follow up manually.`,
        `Unclear Response — Manual Review Needed: ${state.scriptTitle}`,
        state.accountManagerName
      );
    }

    summary = `Ambiguous response from ${state.clientName} — flagged for manual review`;
  }

  // ── Store to client memory ────────────────────────────────────────────────
  try {
    const memoryContent = `Client ${state.clientName} responded to script approval for "${state.scriptTitle}" with classification: ${classification}. Response: "${state.clientResponse?.slice(0, 200)}"`;
    const embedding = await embeddings.embedQuery(memoryContent);

    await supabase.from("client_memories").insert({
      client_id: state.clientId,
      content: memoryContent,
      embedding,
      memory_type: "approval",
      metadata: {
        script_id: state.scriptId,
        classification,
        script_title: state.scriptTitle,
      },
    });
  } catch (err) {
    console.warn("[resolveApproval] Failed to store memory:", err);
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  await supabase.from("audit_log").insert({
    entity_type: "script",
    entity_id: state.scriptId,
    action: `approval_${classification}`,
    actor: "approval_agent",
    metadata: {
      client: state.clientName,
      classification,
      revision_notes: state.revisionNotes ?? null,
    },
  });

  const log: NodeLogEntry = {
    node: "resolveApproval",
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary,
  };

  return {
    approvalStatus: finalStatus,
    nodeLog: [log],
  };
}
