import { ChatAnthropic } from "@langchain/anthropic";
import type { ApprovalState } from "../../approvalTypes";
import type { NodeLogEntry } from "../../types";

const model = new ChatAnthropic({
  model: "claude-haiku-4-5-20251001",
  maxTokens: 400,
  temperature: 0.6,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateApprovalRequest(
  state: ApprovalState
): Promise<Partial<ApprovalState>> {
  const start = Date.now();

  const memoryContext =
    state.clientMemories && state.clientMemories.length > 0
      ? `\nPast interactions with this client:\n${state.clientMemories.slice(0, 3).join("\n")}`
      : "";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const reviewLink = state.reviewToken
    ? `${appUrl}/review/${state.reviewToken}`
    : null;

  const prompt = `You are a professional content coordinator at Scrollhouse, a short-form video content agency.

Write a concise, friendly approval request message to ${state.clientName} asking them to review and approve the script titled "${state.scriptTitle}".

Guidelines:
- Open with the purpose immediately — no filler
- Mention the script name specifically
- Give a clear call to action: Reply with APPROVE, request revisions, or let us know if you need a call
- Set a 48-hour response expectation politely
- Keep it under 120 words
- Sound human, not automated
${reviewLink ? `- Include this review link: ${reviewLink}` : ""}
${memoryContext}

Write only the message body. No subject line.`;

  const response = await model.invoke([{ role: "user", content: prompt }]);
  const message = (response.content as string).trim();

  const log: NodeLogEntry = {
    node: "generateApprovalRequest",
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: `Generated approval request for "${state.scriptTitle}"`,
  };

  return {
    approvalRequestMessage: message,
    nodeLog: [log],
  };
}
