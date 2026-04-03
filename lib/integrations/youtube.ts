const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const MAX_SEARCH_RESULTS = 50;

export interface YouTubeVideoMetrics {
  id: string;
  title: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
}

async function fetchRecentVideoIds(
  apiKey: string,
  channelId: string,
  since: string,
): Promise<string[]> {
  const params = new URLSearchParams({
    part: "snippet",
    channelId,
    type: "video",
    order: "date",
    publishedAfter: since,
    maxResults: String(MAX_SEARCH_RESULTS),
    key: apiKey,
  });

  const res = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube search API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const items = data.items ?? [];

  return items.map(
    (item: { id: { videoId: string } }) => item.id.videoId,
  );
}

async function fetchVideoStats(
  apiKey: string,
  videoIds: string[],
): Promise<YouTubeVideoMetrics[]> {
  const params = new URLSearchParams({
    part: "statistics,contentDetails,snippet",
    id: videoIds.join(","),
    key: apiKey,
  });

  const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube videos API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  const items = data.items ?? [];

  return items.map(
    (item: {
      id: string;
      snippet: { title: string; publishedAt: string };
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails: { duration: string };
    }) => ({
      id: item.id,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
      viewCount: Number(item.statistics.viewCount ?? 0),
      likeCount: Number(item.statistics.likeCount ?? 0),
      commentCount: Number(item.statistics.commentCount ?? 0),
      duration: item.contentDetails.duration,
    }),
  );
}

export async function fetchYouTubeMetrics(
  apiKey: string,
  channelId: string,
  since: string,
): Promise<YouTubeVideoMetrics[]> {
  const videoIds = await fetchRecentVideoIds(apiKey, channelId, since);

  if (videoIds.length === 0) {
    return [];
  }

  return fetchVideoStats(apiKey, videoIds);
}
