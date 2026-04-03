import { createServiceClientDirect } from "@/lib/supabase/server";
import type { AgentState } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

const CHANNEL_ADVANTAGE_THRESHOLD = 0.20;
const SLIDING_WINDOW_DAYS = 90;

interface ChannelStats {
  sent: number;
  responses: number;
}

function responseRate(stats: ChannelStats): number {
  if (stats.sent === 0) return 0;
  return stats.responses / stats.sent;
}

function pickByAdvantage(email: ChannelStats, whatsapp: ChannelStats): string | null {
  const emailRate = responseRate(email);
  const whatsappRate = responseRate(whatsapp);
  const diff = Math.abs(emailRate - whatsappRate);
  if (diff <= CHANNEL_ADVANTAGE_THRESHOLD) return null;
  return emailRate > whatsappRate ? "email" : "whatsapp";
}

async function fetchClient(supabase: SupabaseAny, clientId: string) {
  const { data, error } = await supabase
    .from("clients")
    .select("preferred_channel, whatsapp_number")
    .eq("id", clientId)
    .single();
  if (error) throw new Error(`[channelStrategy] Failed to fetch client: ${error.message}`);
  return data as { preferred_channel: string; whatsapp_number: string | null };
}

async function fetchChaserHistory(supabase: SupabaseAny, clientId: string) {
  // Fix 9: Add 90-day sliding window filter
  const windowCutoff = new Date(Date.now() - SLIDING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("chasers")
    .select("id, script_id, scripts!inner(review_channel, reviewed_at)")
    .eq("scripts.client_id", clientId)
    .gte("created_at", windowCutoff);
  if (error) throw new Error(`[channelStrategy] Failed to fetch chaser history: ${error.message}`);
  return (data ?? []) as Array<{
    id: string;
    script_id: string;
    scripts: { review_channel: string; reviewed_at: string | null };
  }>;
}

function buildStats(history: Array<{ scripts: { review_channel: string; reviewed_at: string | null } }>): Record<string, ChannelStats> {
  const stats: Record<string, ChannelStats> = {
    email: { sent: 0, responses: 0 },
    whatsapp: { sent: 0, responses: 0 },
  };
  for (const entry of history) {
    const channel = entry.scripts.review_channel;
    if (!(channel in stats)) continue;
    stats[channel].sent++;
    if (entry.scripts.reviewed_at) stats[channel].responses++;
  }
  return stats;
}

function resolveChannel(
  stats: Record<string, ChannelStats>,
  preferred: string,
  hasWhatsapp: boolean,
  scriptStatus: string | undefined,
): string {
  if (!hasWhatsapp) return "email";

  const hasHistory = stats.email.sent > 0 || stats.whatsapp.sent > 0;
  const advantaged = hasHistory ? pickByAdvantage(stats.email, stats.whatsapp) : null;
  const base = advantaged ?? preferred;

  if (scriptStatus === "escalated" && base === "email") return "both";

  return base;
}

async function fetchScriptStatus(supabase: SupabaseAny, scriptId: string): Promise<string> {
  const { data, error } = await supabase
    .from("scripts")
    .select("status")
    .eq("id", scriptId)
    .single();
  if (error) throw new Error(`[channelStrategy] Failed to fetch script status: ${error.message}`);
  return (data as { status: string }).status;
}

export async function determineChannel(state: AgentState): Promise<Partial<AgentState>> {
  const supabase: SupabaseAny = createServiceClientDirect();

  const client = await fetchClient(supabase, state.clientId);
  const history = await fetchChaserHistory(supabase, state.clientId);
  const stats = buildStats(history);
  const scriptStatus = await fetchScriptStatus(supabase, state.scriptId);

  const result = resolveChannel(
    stats,
    client.preferred_channel,
    client.whatsapp_number !== null,
    scriptStatus,
  );

  return {
    recommendedChannel: result,
    preferredChannel: client.preferred_channel,
  };
}
