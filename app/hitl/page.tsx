import { createServiceClientDirect } from "@/lib/supabase/server";
import HitlList from "@/components/hitl/HitlList";
import AppSidebar from "@/components/shared/AppSidebar";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export interface ChaserData {
  id: string;
  draft_content: string;
  created_at: string;
  script_id: string;
  client_id: string;
  status: string;
  hitl_state: {
    email_subject?: string;
    hours_overdue?: number;
    client_email?: string;
    tone_recommendation?: string;
    urgency_score?: number;
    revision_count?: number;
    critique_feedback?: string;
    critique_scores?: {
      professionalism?: number;
      personalization?: number;
      clarity?: number;
      persuasiveness?: number;
      average?: number;
    };
  } | null;
  client: {
    name: string;
    company: string | null;
    email: string;
    whatsapp_number: string | null;
    preferred_channel: string;
    avg_response_hours: number | null;
    approved_count: number;
    rejected_count: number;
    changes_requested_count: number;
    total_scripts: number;
  };
  script: {
    title: string;
    content: string;
    platform: string | null;
    assigned_writer: string | null;
    sent_at: string | null;
    status: string | null;
    client_feedback: string | null;
    reviewed_at: string | null;
    quality_score: {
      hook_strength?: number;
      cta_clarity?: number;
      tone_consistency?: number | null;
      brand_alignment?: number;
      platform_fit?: number;
      pacing_structure?: number;
      average?: number;
      feedback?: string;
      strengths?: string[];
      improvements?: string[];
    } | null;
  };
  chaser_count: number;
}

async function getPendingChasers(): Promise<ChaserData[]> {
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data, error } = await supabase
    .from("chasers")
    .select("id, draft_content, created_at, script_id, client_id, status, hitl_state, clients(name, company, email, whatsapp_number, preferred_channel, avg_response_hours, approved_count, rejected_count, changes_requested_count, total_scripts), scripts(title, content, platform, assigned_writer, sent_at, status, client_feedback, reviewed_at, quality_score)")
    .in("status", ["pending_hitl", "draft_saved"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[hitl] Failed to fetch chasers:", error.message);
    return [];
  }

  const all = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    client: row.clients,
    script: row.scripts,
    chaser_count: 0,
  })) as ChaserData[];

  const seen = new Set<string>();
  const deduped = all.filter((c) => {
    if (seen.has(c.script_id)) return false;
    seen.add(c.script_id);
    return true;
  });

  if (deduped.length > 0) {
    const scriptIds = deduped.map((c) => c.script_id);
    const { data: sentChasers } = await supabase
      .from("chasers")
      .select("script_id")
      .in("script_id", scriptIds)
      .in("status", ["approved", "edited", "sent"]);

    if (sentChasers) {
      const counts: Record<string, number> = {};
      for (const row of sentChasers as { script_id: string }[]) {
        counts[row.script_id] = (counts[row.script_id] ?? 0) + 1;
      }
      for (const c of deduped) {
        c.chaser_count = counts[c.script_id] ?? 0;
      }
    }
  }

  return deduped;
}

async function getClientMemories(clientIds: string[]): Promise<Record<string, { content: string; memory_type: string; created_at: string }[]>> {
  if (clientIds.length === 0) return {};
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data, error } = await supabase
    .from("client_memories")
    .select("client_id, content, memory_type, created_at")
    .in("client_id", clientIds)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error || !data) return {};

  const map: Record<string, { content: string; memory_type: string; created_at: string }[]> = {};
  for (const row of data as { client_id: string; content: string; memory_type: string; created_at: string }[]) {
    if (!map[row.client_id]) map[row.client_id] = [];
    if (map[row.client_id].length < 3) {
      map[row.client_id].push(row);
    }
  }
  return map;
}

export default async function HitlPage() {
  const chasers = await getPendingChasers();
  const clientIds = [...new Set(chasers.map((c) => c.client_id))];
  const memories = await getClientMemories(clientIds);

  return (
    <div className="min-h-screen bg-[var(--bg)] flex transition-colors duration-300">
      <AppSidebar />

      <main className="flex-1 md:ml-[220px] ml-0 min-h-screen p-6 max-w-[1600px]">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-lg font-semibold text-[var(--text)]">HITL Review Panel</h1>
          {chasers.length > 0 && (
            <span className="text-xs text-[var(--muted)]">
              <span className="text-orange-400 font-medium">{chasers.length}</span> pending
            </span>
          )}
        </header>

        <HitlList initialChasers={chasers} memories={memories} />
      </main>
    </div>
  );
}
