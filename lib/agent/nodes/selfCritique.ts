import { ChatAnthropic } from "@langchain/anthropic";
import { MODEL_CLAUDE_HAIKU } from "../config";
import type { AgentState, CritiqueScores, NodeLogEntry } from "../types";

const model = new ChatAnthropic({
  model: MODEL_CLAUDE_HAIKU,
  maxTokens: 800,
  temperature: 0,
});

function buildCritiquePrompt(state: AgentState): string {
  return `You are a strict email quality auditor. Your job is to FAIL emails that are not good enough.

Evaluate this follow-up email against each criterion. Answer PASS or FAIL for each. Be strict — if in doubt, FAIL it.

CRITERIA:
1. opens_with_purpose: First sentence directly states why you're writing (NOT "hope you're well" or pleasantries)
2. mentions_script_name: References the specific script title "${state.scriptTitle}" by name
3. references_overdue_time: Mentions how long the review has been pending (${state.hoursOverdue} hours / ${Math.round(state.hoursOverdue / 24)} days)
4. specific_ask: Contains a clear, concrete ask with a deadline (NOT vague "let us know" or "when you get a chance")
5. appropriate_length: Email body is under 150 words (short and scannable)
6. matches_target_tone: Tone matches the target "${state.toneRecommendation ?? "neutral"}" (gentle=soft/patient, neutral=professional/direct, firm=assertive/clear-deadline, urgent=high-stakes/immediate)
7. no_guilt_tripping: Does NOT use passive-aggressive language, guilt, or emotional manipulation
8. no_cliches: Does NOT use "just checking in", "circling back", "touching base", "following up", "as per my last email"
9. no_placeholder_text: Contains zero placeholder text like [date], [name], [Your Name], [company]
10. personalized_content: References something specific about the script content or client relationship (NOT generic)

BAD EMAIL EXAMPLE (should get 3-4 passes max):
"Hi there, Just checking in on the script we sent over. Hope you had a chance to look at it. Let us know your thoughts when you get a chance. Best, Team"

GOOD EMAIL EXAMPLE (should get 9-10 passes):
"We sent over the 'Air Max Summer Campaign' script on March 5 and wanted to check if you received it. The opening golden-hour sequence has strong visual potential for Instagram. Could you share your feedback by end of day Thursday? If you need more time or have questions, just reply. Best, Scrollhouse Team"

Output EXACTLY this JSON format (no markdown, no code blocks):
{"criteria": [{"name": "opens_with_purpose", "result": "PASS", "reason": "..."}, ...all 10...], "pass_count": <number>, "total": 10, "failed_criteria": ["name1", "name2"], "feedback": "<one sentence: what specifically needs fixing>"}`;
}

function clamp(val: unknown, min: number, max: number): number {
  const num = typeof val === "number" && !isNaN(val) ? val : min;
  return Math.max(min, Math.min(max, num));
}

// Map pass/fail criteria to legacy score categories for backward compatibility with HITL UI
function criteriaToScores(passCount: number, total: number, criteria: { name: string; result: string }[]): CritiqueScores {
  const passed = new Set(criteria.filter(c => c.result === "PASS").map(c => c.name));

  const profItems = ["opens_with_purpose", "no_cliches", "no_guilt_tripping"];
  const profScore = Math.round((profItems.filter(i => passed.has(i)).length / profItems.length) * 10);

  const persItems = ["mentions_script_name", "personalized_content", "references_overdue_time"];
  const persScore = Math.round((persItems.filter(i => passed.has(i)).length / persItems.length) * 10);

  const clarItems = ["specific_ask", "appropriate_length", "no_placeholder_text"];
  const clarScore = Math.round((clarItems.filter(i => passed.has(i)).length / clarItems.length) * 10);

  const persuItems = ["matches_target_tone", "specific_ask", "personalized_content"];
  const persuScore = Math.round((persuItems.filter(i => passed.has(i)).length / persuItems.length) * 10);

  const avg = Math.round(((passCount / total) * 10) * 10) / 10;

  return {
    professionalism: profScore,
    personalization: persScore,
    clarity: clarScore,
    persuasiveness: persuScore,
    average: avg,
    feedback: "",
  };
}

function failureCritiqueScores(reason: string): CritiqueScores {
  return {
    professionalism: 0,
    personalization: 0,
    clarity: 0,
    persuasiveness: 0,
    average: 0,
    feedback: `Self-critique failed: ${reason}`,
  };
}

export async function selfCritique(state: AgentState): Promise<AgentState> {
  const start = Date.now();

  if (!state.generatedEmail) {
    return state;
  }

  try {
    const response = await model.invoke([
      { role: "system", content: buildCritiquePrompt(state) },
      {
        role: "user",
        content: `Draft email to evaluate:\n\n${state.generatedEmail}`,
      },
    ]);

    const text = typeof response.content === "string"
      ? response.content
      : (response.content as Array<{ type: string; text?: string }>)
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("");

    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());

    const criteria = Array.isArray(parsed.criteria) ? parsed.criteria : [];
    const passCount = clamp(parsed.pass_count, 0, 10);
    const total = clamp(parsed.total, 1, 10);
    const failedCriteria: string[] = Array.isArray(parsed.failed_criteria) ? parsed.failed_criteria : [];
    const feedback = typeof parsed.feedback === "string" ? parsed.feedback : "No feedback provided";

    const scores = criteriaToScores(passCount, total, criteria);
    scores.feedback = feedback;

    const detailedFeedback = failedCriteria.length > 0
      ? `Failed criteria: ${failedCriteria.join(", ")}. ${feedback}`
      : feedback;
    scores.feedback = detailedFeedback;

    const entry: NodeLogEntry = {
      node: "selfCritique",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      summary: `${passCount}/${total} criteria passed (${failedCriteria.length > 0 ? `Failed: ${failedCriteria.join(", ")}` : "All passed"})`,
    };

    return {
      ...state,
      critiqueScores: scores,
      nodeExecutionLog: [...state.nodeExecutionLog, entry],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Self-critique failed";
    console.error("[selfCritique]", message);

    const entry: NodeLogEntry = {
      node: "selfCritique",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      summary: `Error: ${message}`,
    };

    // Fix 4: Return explicit failure scores (average=0) that route to revision instead of null
    return {
      ...state,
      critiqueScores: failureCritiqueScores(message),
      nodeExecutionLog: [...state.nodeExecutionLog, entry],
    };
  }
}
