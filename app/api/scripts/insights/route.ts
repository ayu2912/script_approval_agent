import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import Anthropic from "@anthropic-ai/sdk";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

interface Theme {
  label: string;
  count: number;
  example: string;
}

let cachedResult: { themes: Theme[]; fetchedAt: number; feedbackHash: string } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET() {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const supabase: SupabaseAny = createServiceClientDirect();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("scripts")
    .select("client_feedback")
    .in("status", ["changes_requested", "rejected"])
    .gte("created_at", thirtyDaysAgo)
    .not("client_feedback", "is", null);

  if (error) {
    console.error("[scripts/insights] Query failed:", error.message);
    return NextResponse.json({ error: "Failed to fetch insights" }, { status: 500 });
  }

  const feedbackItems: string[] = (data ?? [])
    .map((row: { client_feedback: string | null }) => row.client_feedback)
    .filter((f: string | null): f is string => !!f && f.trim().length > 0);

  const feedbackHash = feedbackItems.length + ":" + feedbackItems.slice(0, 10).join("|").slice(0, 200);

  if (cachedResult && Date.now() - cachedResult.fetchedAt < CACHE_TTL && cachedResult.feedbackHash === feedbackHash) {
    return NextResponse.json({ themes: cachedResult.themes });
  }

  if (feedbackItems.length < 3) {
    return NextResponse.json({ insights: [], message: "Not enough data yet" });
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Here are ${feedbackItems.length} pieces of client feedback on content scripts from the past 30 days. Cluster them into the top 3-5 themes. Return ONLY JSON: { "themes": [{ "label": string, "count": number, "example": string }] }

Feedback items:
${feedbackItems.map((f, i) => `${i + 1}. "${f}"`).join("\n")}

JSON:`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
    const themes: Theme[] = parsed.themes ?? [];

    cachedResult = { themes, fetchedAt: Date.now(), feedbackHash };

    return NextResponse.json({ themes });
  } catch (err) {
    console.error("[insights] Claude analysis failed:", err);
    return NextResponse.json({ themes: [], message: "Analysis failed" });
  }
}
