import Anthropic from "@anthropic-ai/sdk";
import { createServiceClientDirect } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface BriefInput {
  rawInput: string;
  contentType: string;
  platform?: string;
  topic?: string;
  targetAudience?: string;
  keyMessages?: string;
  tone?: string;
  referenceLinks?: string;
  specialInstructions?: string;
  clientId: string;
}

export interface ParsedBrief {
  title: string;
  hook_angle: string;
  core_message: string;
  key_talking_points: string[];
  cta: string;
  tone_direction: string;
  platform_constraints: {
    format: string;
    max_duration?: string;
    aspect_ratio?: string;
    character_limit?: number;
  };
  target_audience_profile: string;
  brand_alignment_notes: string;
  reference_notes?: string;
  estimated_word_count?: number;
  writer_notes: string;
  error?: boolean;
}

const PLATFORM_CONSTRAINTS: Record<string, { format: string; max_duration?: string; aspect_ratio?: string; character_limit?: number }> = {
  Instagram: { format: "Reel / Carousel / Story", max_duration: "90s (Reels)", aspect_ratio: "9:16 (Reels/Stories), 1:1 (Feed)", character_limit: 2200 },
  YouTube: { format: "Long-form / Shorts", max_duration: "10-15 min (long-form), 60s (Shorts)", aspect_ratio: "16:9 (long-form), 9:16 (Shorts)" },
  TikTok: { format: "Short-form vertical video", max_duration: "60s (optimal), up to 10 min", aspect_ratio: "9:16", character_limit: 2200 },
  LinkedIn: { format: "Thought leadership / Professional video", max_duration: "10 min", aspect_ratio: "1:1 or 16:9", character_limit: 3000 },
  "X/Twitter": { format: "Short-form clip / Thread hook", max_duration: "2:20", aspect_ratio: "16:9 or 1:1", character_limit: 280 },
};

function isValidParsedBrief(parsed: unknown): parsed is Record<string, unknown> {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
  const obj = parsed as Record<string, unknown>;
  return typeof obj.title === "string" && typeof obj.core_message === "string";
}

function fallbackBrief(reason: string): ParsedBrief {
  console.error("[parseBrief] Returning fallback brief:", reason);
  return {
    title: "Untitled Brief",
    hook_angle: "",
    core_message: "",
    key_talking_points: [],
    cta: "",
    tone_direction: "",
    platform_constraints: { format: "General" },
    target_audience_profile: "",
    brand_alignment_notes: "",
    writer_notes: `Brief parsing failed: ${reason}`,
    error: true,
  };
}

export async function parseBrief(input: BriefInput): Promise<ParsedBrief> {
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data: client } = await supabase
    .from("clients")
    .select("name, company, brand_voice, platform_focus")
    .eq("id", input.clientId)
    .single();

  const { data: memories } = await supabase
    .from("client_memories")
    .select("content, memory_type")
    .eq("client_id", input.clientId)
    .order("created_at", { ascending: false })
    .limit(3);

  const clientName = client?.name ?? "Unknown Client";
  const company = client?.company ?? "";
  const brandVoice = client?.brand_voice ?? "Not specified";
  const platformFocus = client?.platform_focus ?? [];

  const memoryContext = memories && memories.length > 0
    ? memories.map((m: { content: string; memory_type: string }) => `- [${m.memory_type}] ${m.content}`).join("\n")
    : "No prior history available.";

  const platformKey = input.platform ?? (platformFocus.length > 0 ? platformFocus[0] : null);
  const constraints = platformKey ? PLATFORM_CONSTRAINTS[platformKey] ?? null : null;

  const constraintsStr = constraints
    ? `Format: ${constraints.format}, Max Duration: ${constraints.max_duration ?? "N/A"}, Aspect Ratio: ${constraints.aspect_ratio ?? "N/A"}, Character Limit: ${constraints.character_limit ?? "N/A"}`
    : "No specific platform constraints.";

  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `You are a senior content strategist at a video content agency. Transform this raw brief intake into a structured internal brief that a scriptwriter can immediately work from.

CLIENT PROFILE:
- Name: ${clientName}
- Company: ${company || "N/A"}
- Brand Voice: ${brandVoice}
- Platform Focus: ${platformFocus.length > 0 ? platformFocus.join(", ") : "Not specified"}

CLIENT HISTORY:
${memoryContext}

PLATFORM CONSTRAINTS:
${constraintsStr}

RAW BRIEF INTAKE:
Content Type: ${input.contentType}
Platform: ${input.platform ?? "Not specified"}
Topic: ${input.topic ?? "Not specified"}
Target Audience: ${input.targetAudience ?? "Not specified"}
Key Messages: ${input.keyMessages ?? "Not specified"}
Tone: ${input.tone ?? "Not specified"}
Reference Links: ${input.referenceLinks ?? "None"}
Special Instructions: ${input.specialInstructions ?? "None"}

RAW INPUT / PASTED CONTENT:
"""
${input.rawInput.slice(0, 4000)}
"""

Transform this into a structured internal brief. Be specific and actionable. The scriptwriter should be able to start writing immediately from your output.

Return ONLY valid JSON with this exact structure:
{
  "title": "Short, descriptive title for this brief (max 60 chars)",
  "hook_angle": "The specific angle/hook to lead with in the first 3 seconds",
  "core_message": "The single most important takeaway the audience should get",
  "key_talking_points": ["point 1", "point 2", "point 3"],
  "cta": "Specific call-to-action for the viewer",
  "tone_direction": "Detailed tone guidance for the writer (e.g. 'Conversational but authoritative, like explaining to a smart friend')",
  "platform_constraints": {
    "format": "specific format",
    "max_duration": "duration if applicable",
    "aspect_ratio": "ratio if applicable",
    "character_limit": number_or_null
  },
  "target_audience_profile": "Detailed audience description including demographics, psychographics, pain points",
  "brand_alignment_notes": "How this content should align with the brand voice and identity",
  "reference_notes": "Notes on any reference links or examples provided, or null",
  "estimated_word_count": number_or_null,
  "writer_notes": "Any additional context, warnings, or suggestions for the scriptwriter"
}

JSON:`,
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "API call failed";
    return fallbackBrief(message);
  }

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();

  // C1: Wrap JSON.parse in try-catch
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("[parseBrief] Failed to parse LLM response:", cleaned.slice(0, 500));
    return fallbackBrief("LLM returned non-JSON response");
  }

  // A1: Validate shape
  if (!isValidParsedBrief(parsed)) {
    console.error("[parseBrief] Invalid response shape:", JSON.stringify(parsed).slice(0, 500));
    return fallbackBrief("LLM returned invalid response shape");
  }

  const p = parsed as Record<string, unknown>;

  return {
    title: typeof p.title === "string" ? p.title : "Untitled Brief",
    hook_angle: typeof p.hook_angle === "string" ? p.hook_angle : "",
    core_message: typeof p.core_message === "string" ? p.core_message : "",
    key_talking_points: Array.isArray(p.key_talking_points) ? p.key_talking_points as string[] : [],
    cta: typeof p.cta === "string" ? p.cta : "",
    tone_direction: typeof p.tone_direction === "string" ? p.tone_direction : "",
    platform_constraints: {
      format: (p.platform_constraints as Record<string, unknown>)?.format as string ?? constraints?.format ?? "General",
      max_duration: (p.platform_constraints as Record<string, unknown>)?.max_duration as string ?? constraints?.max_duration ?? undefined,
      aspect_ratio: (p.platform_constraints as Record<string, unknown>)?.aspect_ratio as string ?? constraints?.aspect_ratio ?? undefined,
      character_limit: typeof (p.platform_constraints as Record<string, unknown>)?.character_limit === "number" ? (p.platform_constraints as Record<string, unknown>).character_limit as number : (constraints?.character_limit ?? undefined),
    },
    target_audience_profile: typeof p.target_audience_profile === "string" ? p.target_audience_profile : "",
    brand_alignment_notes: typeof p.brand_alignment_notes === "string" ? p.brand_alignment_notes : "",
    reference_notes: typeof p.reference_notes === "string" ? p.reference_notes : undefined,
    estimated_word_count: typeof p.estimated_word_count === "number" ? p.estimated_word_count : undefined,
    writer_notes: typeof p.writer_notes === "string" ? p.writer_notes : "",
  };
}
