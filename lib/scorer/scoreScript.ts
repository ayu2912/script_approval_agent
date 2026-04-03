import Anthropic from "@anthropic-ai/sdk";
import { MODEL_CLAUDE_HAIKU } from "@/lib/agent/config";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ScoreResult {
  hook_strength: number;
  cta_clarity: number;
  tone_consistency: number | null;
  brand_alignment: number;
  platform_fit: number;
  pacing_structure: number;
  average: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  error?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

function clamp(val: unknown, min: number, max: number): number {
  const num = typeof val === "number" && !isNaN(val) ? val : 0;
  return Math.max(min, Math.min(max, num));
}

function isValidScoreShape(parsed: unknown): parsed is Record<string, unknown> {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
  const obj = parsed as Record<string, unknown>;
  return typeof obj.hook_strength !== "undefined" && typeof obj.cta_clarity !== "undefined";
}

function fallbackScore(reason: string): ScoreResult {
  console.error("[scoreScript] Returning fallback score:", reason);
  return {
    hook_strength: 5,
    cta_clarity: 5,
    tone_consistency: null,
    brand_alignment: 5,
    platform_fit: 5,
    pacing_structure: 5,
    average: 5,
    feedback: `Scoring failed: ${reason}`,
    strengths: [],
    improvements: [],
    error: true,
  };
}

export async function scoreScript({
  content,
  clientId,
  platform,
  supabase,
}: {
  content: string;
  clientId: string;
  platform?: string | null;
  supabase: SupabaseAny;
}): Promise<ScoreResult> {
  const { data: client } = await supabase
    .from("clients")
    .select("name, company, brand_voice, platform_focus, monthly_volume")
    .eq("id", clientId)
    .single();

  const { data: memories } = await supabase
    .from("client_memories")
    .select("content, memory_type")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(8);

  const clientName = client?.name ?? "Unknown Client";
  const company = client?.company ?? "Unknown Brand";
  const brandVoice = client?.brand_voice ?? null;
  const platformFocus = client?.platform_focus ?? [];
  const hasMemories = memories && memories.length > 0;

  const clientContext: string[] = [];
  if (brandVoice) {
    clientContext.push(`BRAND VOICE: ${brandVoice}`);
  }
  if (platformFocus.length > 0) {
    clientContext.push(`PLATFORM FOCUS: ${platformFocus.join(", ")}`);
  }
  if (hasMemories) {
    const feedbackMemories = memories
      .filter((m: { memory_type: string }) => ["feedback", "approval", "rejection", "client_response"].includes(m.memory_type))
      .slice(0, 4);
    const behaviorMemories = memories
      .filter((m: { memory_type: string }) => m.memory_type === "behavioral_pattern")
      .slice(0, 3);

    if (feedbackMemories.length > 0) {
      clientContext.push("PAST FEEDBACK FROM CLIENT:");
      for (const m of feedbackMemories) {
        clientContext.push(`- ${(m as { content: string }).content}`);
      }
    }
    if (behaviorMemories.length > 0) {
      clientContext.push("CLIENT BEHAVIOR PATTERNS:");
      for (const m of behaviorMemories) {
        clientContext.push(`- ${(m as { content: string }).content}`);
      }
    }
  }

  const clientContextStr = clientContext.length > 0
    ? clientContext.join("\n")
    : "No client profile or history available.";

  const platformStr = platform ?? (platformFocus.length > 0 ? platformFocus[0] : "general");

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL_CLAUDE_HAIKU,
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: `You are a strict content quality reviewer for a video content agency. Be honest and critical. Most scripts are average (4-6). Only give 8+ for genuinely exceptional work.

Score this video script for the client "${clientName}" (${company}), targeted at "${platformStr}".

CLIENT CONTEXT:
${clientContextStr}

SCRIPT:
"""
${content.slice(0, 3000)}
"""

SCORING DIMENSIONS (1-10 each):

1. hook_strength: Does the opening grab attention in the first 3 seconds? Is it original or generic?
   1-3: Weak/generic ("OPEN on...")  |  4-6: Decent but predictable  |  7-8: Strong and specific  |  9-10: Exceptional (RARE)

2. cta_clarity: Is there a clear call-to-action? Does the viewer know what to do/feel?
   1-3: No CTA or vague  |  4-6: CTA exists but generic  |  7-8: Clear and specific  |  9-10: Compelling (RARE)

3. brand_alignment: Does this script match the brand's identity, values, and voice?${brandVoice ? ` The client specified: "${brandVoice}"` : " No brand voice specified — score based on general brand consistency with " + company + "."}
   1-3: Off-brand  |  4-6: Somewhat aligned  |  7-8: Strong fit  |  9-10: Perfect brand match (RARE)

4. platform_fit: Is this script optimized for ${platformStr}? (format, length, visual style, audience behavior on that platform)
   1-3: Wrong format for platform  |  4-6: Could work  |  7-8: Well-optimized  |  9-10: Platform-native (RARE)

5. pacing_structure: Is the script well-structured? Does it flow logically? Right length for the format?
   1-3: Confusing or too long/short  |  4-6: Acceptable  |  7-8: Tight and well-paced  |  9-10: Perfect rhythm (RARE)

${hasMemories ? `6. tone_consistency: Based on past client feedback and preferences above, does this match what the client has liked/disliked before?
   1-3: Ignores past feedback  |  4-6: Somewhat aware  |  7-8: Shows clear learning  |  9-10: Perfectly adapted (RARE)` : "Skip tone_consistency (no client history)."}

Return ONLY valid JSON:
${hasMemories
  ? `{"hook_strength": N, "cta_clarity": N, "brand_alignment": N, "platform_fit": N, "pacing_structure": N, "tone_consistency": N, "feedback": "one sentence overall assessment", "strengths": ["strength1", "strength2"], "improvements": ["improvement1", "improvement2"]}`
  : `{"hook_strength": N, "cta_clarity": N, "brand_alignment": N, "platform_fit": N, "pacing_structure": N, "feedback": "one sentence overall assessment", "strengths": ["strength1", "strength2"], "improvements": ["improvement1", "improvement2"]}`}

JSON:`,
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "API call failed";
    return fallbackScore(message);
  }

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";

  // C1: Wrap JSON.parse in try-catch
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
  } catch {
    console.error("[scoreScript] Failed to parse LLM response:", text.slice(0, 500));
    return fallbackScore("LLM returned non-JSON response");
  }

  // A1: Validate shape
  if (!isValidScoreShape(parsed)) {
    console.error("[scoreScript] Invalid response shape:", JSON.stringify(parsed).slice(0, 500));
    return fallbackScore("LLM returned invalid response shape");
  }

  const hookScore = clamp(parsed.hook_strength, 1, 10);
  const ctaScore = clamp(parsed.cta_clarity, 1, 10);
  const brandScore = clamp(parsed.brand_alignment, 1, 10);
  const platformScore = clamp(parsed.platform_fit, 1, 10);
  const pacingScore = clamp(parsed.pacing_structure, 1, 10);

  const scores: number[] = [hookScore, ctaScore, brandScore, platformScore, pacingScore];
  let toneScore: number | null = null;

  if (hasMemories && parsed.tone_consistency !== undefined) {
    toneScore = clamp(parsed.tone_consistency, 1, 10);
    scores.push(toneScore);
  }

  const average = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;

  return {
    hook_strength: hookScore,
    cta_clarity: ctaScore,
    tone_consistency: toneScore,
    brand_alignment: brandScore,
    platform_fit: platformScore,
    pacing_structure: pacingScore,
    average,
    feedback: typeof parsed.feedback === "string" ? parsed.feedback : "No feedback.",
    strengths: Array.isArray(parsed.strengths) ? (parsed.strengths as string[]).slice(0, 3) : [],
    improvements: Array.isArray(parsed.improvements) ? (parsed.improvements as string[]).slice(0, 3) : [],
  };
}
