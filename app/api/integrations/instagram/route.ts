import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/requireSession";
import { fetchInstagramMetrics } from "@/lib/integrations/instagram";

const DEFAULT_RANGE_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export async function GET(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "Instagram integration not configured" },
      { status: 501 }
    );
  }

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const until = searchParams.get("until") ?? now.toISOString();
  const since =
    searchParams.get("since") ??
    new Date(now.getTime() - DEFAULT_RANGE_DAYS * MS_PER_DAY).toISOString();

  try {
    const data = await fetchInstagramMetrics(accessToken, since, until);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Instagram fetch failed";
    console.error("[instagram]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
