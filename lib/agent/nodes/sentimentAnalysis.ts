import { ChatAnthropic } from "@langchain/anthropic";
import { MODEL_CLAUDE_HAIKU } from "../config";
import type { AgentState, NodeLogEntry } from "../types";

const model = new ChatAnthropic({
  model: MODEL_CLAUDE_HAIKU,
  maxTokens: 300,
  temperature: 0,
});

const VALID_TONES = ["gentle", "neutral", "firm", "urgent"] as const;

const systemPrompt = `You analyze client follow-up situations and recommend an email tone.
Given the context, output EXACTLY this JSON format (no markdown):
{"urgencyScore": <1-10>, "toneRecommendation": "<one of: gentle, neutral, firm, urgent>"}

Scoring guide:
- 1-3: Low urgency (just overdue, new client, no history of ignoring). Use "gentle".
- 4-6: Medium urgency (significantly overdue, or has ignored before). Use "neutral" or "firm".
- 7-10: High urgency (very overdue, repeated non-response, deadline-sensitive). Use "firm" or "urgent".

IMPORTANT: Match the tone to the urgency. Do NOT recommend "gentle" for high urgency situations.`;

function clamp(val: unknown, min: number, max: number): number {
  const num = typeof val === "number" && !isNaN(val) ? val : min;
  return Math.max(min, Math.min(max, num));
}

function validateTone(val: unknown): string {
  if (typeof val === "string" && VALID_TONES.includes(val as typeof VALID_TONES[number])) {
    return val;
  }
  return "neutral";
}

export async function analyzeSentiment(state: AgentState): Promise<AgentState> {
  const start = Date.now();

  // Fix 6: Guard against null sent_at producing NaN
  const hoursOverdue = isNaN(state.hoursOverdue) || state.hoursOverdue === null || state.hoursOverdue === undefined
    ? 0
    : state.hoursOverdue;

  try {
    const memoryContext = state.clientMemories.length > 0
      ? `Past interactions:\n${state.clientMemories.join("\n")}`
      : "No prior interaction history.";

    const response = await model.invoke([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Client: ${state.clientName}\nScript: "${state.scriptTitle}"\nHours overdue: ${hoursOverdue}\n${memoryContext}`,
      },
    ]);

    const text = typeof response.content === "string"
      ? response.content
      : (response.content as Array<{ type: string; text?: string }>)
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("");

    const parsed = JSON.parse(text.replace(/```[\w]*\n?/g, '').replace(/\n?```/g, '').trim());

    const urgencyScore = clamp(parsed.urgencyScore, 1, 10);
    const toneRecommendation = validateTone(parsed.toneRecommendation);

    const entry: NodeLogEntry = {
      node: "sentimentAnalysis",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      summary: `Urgency: ${urgencyScore}/10, Tone: ${toneRecommendation}`,
    };

    return {
      ...state,
      urgencyScore,
      toneRecommendation,
      nodeExecutionLog: [...state.nodeExecutionLog, entry],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sentiment analysis failed";
    console.error("[sentimentAnalysis]", message);

    // Derive fallback from hours overdue instead of hardcoding neutral
    const fallbackUrgency = hoursOverdue > 168 ? 8 : hoursOverdue > 72 ? 6 : hoursOverdue > 24 ? 4 : 2;
    const fallbackTone = fallbackUrgency >= 7 ? "firm" : fallbackUrgency >= 4 ? "neutral" : "gentle";

    const entry: NodeLogEntry = {
      node: "sentimentAnalysis",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      summary: `Error: ${message} — using fallback urgency ${fallbackUrgency}, tone ${fallbackTone}`,
    };

    return {
      ...state,
      urgencyScore: fallbackUrgency,
      toneRecommendation: fallbackTone,
      nodeExecutionLog: [...state.nodeExecutionLog, entry],
    };
  }
}
