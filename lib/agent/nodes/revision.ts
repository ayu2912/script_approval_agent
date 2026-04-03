import { ChatAnthropic } from "@langchain/anthropic";
import { MODEL_CLAUDE_HAIKU } from "../config";
import type { AgentState, NodeLogEntry } from "../types";

const model = new ChatAnthropic({
  model: MODEL_CLAUDE_HAIKU,
  maxTokens: 500,
  temperature: 0.5,
});

export async function reviseEmail(state: AgentState): Promise<AgentState> {
  const start = Date.now();

  if (!state.generatedEmail || !state.critiqueScores) {
    return state;
  }

  const failedFeedback = state.critiqueScores.feedback ?? "Improve the overall quality.";

  const systemPrompt = `You are revising a follow-up email that failed quality checks.

IMPORTANT: Fix ONLY the specific issues listed below. Do NOT rewrite the entire email. Keep everything that already works.

FAILED QUALITY CHECKS:
${failedFeedback}

RULES:
- Keep the same SUBJECT: / BODY: format
- Keep the email under 150 words
- Do NOT add pleasantries, cliches, or filler
- The script title is "${state.scriptTitle}"
- The client name is "${state.clientName}"
- It has been ${state.hoursOverdue} hours (${Math.round(state.hoursOverdue / 24)} days) since the script was sent
- Target tone: ${state.toneRecommendation ?? "neutral"}
- Sign off as "Scrollhouse Team"

Fix the listed issues and output in SUBJECT: / BODY: format.`;

  try {
    const response = await model.invoke([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Current draft that needs fixing:\nSUBJECT: ${state.emailSubject}\nBODY: ${state.generatedEmail}`,
      },
    ]);

    const text = typeof response.content === "string"
      ? response.content
      : (response.content as Array<{ type: string; text?: string }>)
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("");

    const subjectMatch = text.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
    const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);

    const newSubject = subjectMatch?.[1]?.trim() ?? state.emailSubject;
    const newBody = bodyMatch?.[1]?.trim() ?? state.generatedEmail;

    if (!newBody || newBody.length < 20) {
      throw new Error("Revision produced empty or too-short email");
    }

    const entry: NodeLogEntry = {
      node: "revision",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      summary: `Revision ${state.revisionCount + 1} applied — fixing: ${failedFeedback.slice(0, 100)}`,
    };

    return {
      ...state,
      generatedEmail: newBody,
      emailSubject: newSubject,
      revisionCount: state.revisionCount + 1,
      critiqueScores: null,
      nodeExecutionLog: [...state.nodeExecutionLog, entry],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Revision failed";
    console.error("[revision]", message);

    const entry: NodeLogEntry = {
      node: "revision",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      summary: `Error: ${message}`,
    };

    // On failure, increment revision count to prevent infinite loops
    return {
      ...state,
      revisionCount: state.revisionCount + 1,
      nodeExecutionLog: [...state.nodeExecutionLog, entry],
    };
  }
}
