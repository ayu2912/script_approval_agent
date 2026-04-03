import { ChatAnthropic } from "@langchain/anthropic";
import type { ApprovalState, ResponseClassification } from "../../approvalTypes";
import type { NodeLogEntry } from "../../types";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-6",
  maxTokens: 600,
  temperature: 0.1, // Low temp — we want consistent classification
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

interface ClassificationResult {
  classification: ResponseClassification;
  approvedSections: string | null;
  revisionNotes: string | null;
  rejectionReason: string | null;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

export async function classifyResponse(
  state: ApprovalState
): Promise<Partial<ApprovalState>> {
  const start = Date.now();

  if (!state.clientResponse) {
    return { error: "classifyResponse: No client response to classify" };
  }

  const prompt = `You are classifying a client's response to a script approval request.

Script title: "${state.scriptTitle}"
Client name: ${state.clientName}
Client's response: "${state.clientResponse}"

Classify this response into exactly one category:
- "approved" — client clearly approves (e.g. "looks good", "approved", "go ahead", "👍", "yes", "great", "love it")
- "revision_requested" — client wants changes (e.g. "change X", "fix the CTA", "make it shorter", "not quite right")
- "partial_approval" — client approves some parts but wants changes to others
- "rejected" — client clearly rejects the script entirely
- "call_requested" — client wants to discuss on a call before deciding
- "ambiguous" — cannot determine intent with confidence

Return a JSON object with this exact structure:
{
  "classification": "<one of the above>",
  "approvedSections": "<what they approved, or null>",
  "revisionNotes": "<specific changes requested, structured as bullet points, or null>",
  "rejectionReason": "<why they rejected, or null>",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<one sentence explaining your classification>"
}

Return only valid JSON. No markdown, no explanation outside the JSON.`;

  const response = await model.invoke([{ role: "user", content: prompt }]);
  const raw = (response.content as string).trim();

  let result: ClassificationResult;
  try {
    result = JSON.parse(raw);
  } catch {
    // Fallback if JSON parse fails
    result = {
      classification: "ambiguous",
      approvedSections: null,
      revisionNotes: null,
      rejectionReason: null,
      confidence: "low",
      reasoning: "Could not parse classification response",
    };
  }

  const log: NodeLogEntry = {
    node: "classifyResponse",
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: `Classified as "${result.classification}" (confidence: ${result.confidence}) — ${result.reasoning}`,
  };

  return {
    responseClassification: result.classification,
    approvedSections: result.approvedSections,
    revisionNotes: result.revisionNotes,
    rejectionReason: result.rejectionReason,
    nodeLog: [log],
  };
}
