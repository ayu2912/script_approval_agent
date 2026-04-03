import { notFound } from "next/navigation";
import { createServiceClientDirect } from "@/lib/supabase/server";
import AppSidebar from "@/components/shared/AppSidebar";
import ClientDetailPanel from "@/components/clients/ClientDetailPanel";
import type { Client, Script, ClientMemory } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

interface ScriptWithChaserCount extends Script {
  chaser_count: number;
}

async function getClientData(id: string) {
  const supabase: SupabaseAny = createServiceClientDirect();

  const [clientRes, scriptsRes, memoriesRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase
      .from("scripts")
      .select("*, chasers(id)")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("client_memories")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (clientRes.error || !clientRes.data) return null;

  const scriptsWithChasers: ScriptWithChaserCount[] = (scriptsRes.data ?? []).map(
    (row: Record<string, unknown>) => {
      const { chasers, ...script } = row;
      return {
        ...script,
        chaser_count: Array.isArray(chasers) ? chasers.length : 0,
      };
    }
  );

  const feedbackScripts = scriptsWithChasers.filter(
    (s) => s.client_feedback !== null
  );

  return {
    client: clientRes.data as Client,
    scripts: scriptsWithChasers,
    feedbackScripts,
    memories: (memoriesRes.data ?? []) as ClientMemory[],
  };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getClientData(id);

  if (!data) notFound();

  return (
    <div className="min-h-screen bg-[var(--bg)] flex transition-colors duration-300">
      <AppSidebar />

      <main className="flex-1 md:ml-[220px] ml-0 min-h-screen">
        <ClientDetailPanel
          client={data.client}
          scripts={data.scripts}
          feedbackScripts={data.feedbackScripts}
          memories={data.memories}
        />
      </main>
    </div>
  );
}
