import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/requireSession";
import { fetchYouTubeMetrics } from "@/lib/integrations/youtube";

const DEFAULT_LOOKBACK_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export async function GET(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "YouTube integration not configured" },
      { status: 501 },
    );
  }

  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json(
      { error: "channelId query parameter is required" },
      { status: 400 },
    );
  }

  const since =
    url.searchParams.get("since") ??
    new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * MS_PER_DAY).toISOString();

  try {
    const data = await fetchYouTubeMetrics(apiKey, channelId, since);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "YouTube fetch failed";
    console.error("[youtube]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
