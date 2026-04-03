const MEDIA_FIELDS = "id,caption,timestamp,like_count,comments_count";
const INSIGHT_METRICS = "reach,impressions,shares";
const GRAPH_API_BASE = "https://graph.instagram.com";

export interface InstagramPostMetrics {
  id: string;
  caption: string | null;
  timestamp: string;
  like_count: number;
  comments_count: number;
  reach: number;
  impressions: number;
  shares: number;
}

interface MediaItem {
  id: string;
  caption?: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
}

interface MediaResponse {
  data: MediaItem[];
  paging?: { next?: string };
}

interface InsightValue {
  value: number;
}

interface InsightEntry {
  name: string;
  values: InsightValue[];
}

interface InsightsResponse {
  data: InsightEntry[];
}

const FETCH_TIMEOUT_MS = 15_000;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Instagram API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

function isWithinRange(timestamp: string, since: string, until: string): boolean {
  const ts = new Date(timestamp).getTime();
  return ts >= new Date(since).getTime() && ts <= new Date(until).getTime();
}

const MAX_PAGES = 50;

async function fetchAllMedia(accessToken: string): Promise<MediaItem[]> {
  const items: MediaItem[] = [];
  let url: string | null =
    `${GRAPH_API_BASE}/me/media?fields=${MEDIA_FIELDS}&access_token=${accessToken}`;
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    const page: MediaResponse = await fetchJson<MediaResponse>(url);
    items.push(...page.data);
    url = page.paging?.next ?? null;
    pages++;
  }

  return items;
}

async function fetchInsights(
  mediaId: string,
  accessToken: string
): Promise<{ reach: number; impressions: number; shares: number }> {
  const url =
    `${GRAPH_API_BASE}/${mediaId}/insights?metric=${INSIGHT_METRICS}&access_token=${accessToken}`;

  try {
    const response = await fetchJson<InsightsResponse>(url);
    const metrics = { reach: 0, impressions: 0, shares: 0 };

    for (const entry of response.data) {
      if (entry.name in metrics) {
        metrics[entry.name as keyof typeof metrics] = entry.values[0]?.value ?? 0;
      }
    }

    return metrics;
  } catch {
    return { reach: 0, impressions: 0, shares: 0 };
  }
}

export async function fetchInstagramMetrics(
  accessToken: string,
  since: string,
  until: string
): Promise<InstagramPostMetrics[]> {
  const allMedia = await fetchAllMedia(accessToken);
  const filtered = allMedia.filter((item) => isWithinRange(item.timestamp, since, until));

  const results: InstagramPostMetrics[] = await Promise.all(
    filtered.map(async (item) => {
      const insights = await fetchInsights(item.id, accessToken);
      return {
        id: item.id,
        caption: item.caption ?? null,
        timestamp: item.timestamp,
        like_count: item.like_count,
        comments_count: item.comments_count,
        ...insights,
      };
    })
  );

  return results;
}
