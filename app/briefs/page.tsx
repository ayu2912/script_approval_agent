import { createServiceClientDirect } from "@/lib/supabase/server";
import BriefsPageShell from "@/components/briefs/BriefsPageShell";
import AppSidebar from "@/components/shared/AppSidebar";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

async function getBriefs() {
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data, error } = await supabase
    .from("briefs")
    .select("*, client:clients(id, name, company, email)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch briefs:", error.message);
    return [];
  }

  return data ?? [];
}

async function getClients() {
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data, error } = await supabase
    .from("clients")
    .select("id, name, company")
    .order("name", { ascending: true });

  if (error) return [];
  return data ?? [];
}

export default async function BriefsPage() {
  const [briefs, clients] = await Promise.all([getBriefs(), getClients()]);

  return (
    <div className="min-h-screen bg-[var(--bg)] flex">
      <AppSidebar />
      <main className="flex-1 ml-[220px] min-h-screen">
        <BriefsPageShell initialBriefs={briefs} clients={clients} />
      </main>
    </div>
  );
}
