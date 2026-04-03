import { createServiceClientDirect } from "@/lib/supabase/server";
import AnalyticsPanel from "@/components/analytics/AnalyticsPanel";
import ReportsPanel from "@/components/reports/ReportsPanel";
import AppSidebar from "@/components/shared/AppSidebar";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

async function getClients() {
  const supabase: SupabaseAny = createServiceClientDirect();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, email, company")
    .order("name", { ascending: true });

  if (error) return [];
  return data ?? [];
}

async function getReports() {
  const supabase: SupabaseAny = createServiceClientDirect();
  const { data, error } = await supabase
    .from("reports")
    .select("*, clients(name, email, company)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[analytics] Failed to fetch:", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    client: row.clients,
  }));
}

export default async function AnalyticsPage() {
  const [clients, reports] = await Promise.all([getClients(), getReports()]);

  return (
    <div className="min-h-screen bg-[var(--bg)] flex transition-colors duration-300">
      <AppSidebar />

      <main className="flex-1 md:ml-[220px] ml-0 min-h-screen">
        <header className="flex items-center gap-4 px-6 h-14 border-b border-[var(--border)]">
          <h1 className="text-sm font-medium text-[var(--text)]">Analytics</h1>
        </header>

        <AnalyticsPanel />

        {clients.length > 0 && (
          <div className="border-t border-[var(--border)]">
            <ReportsPanel clients={clients} initialReports={reports} />
          </div>
        )}
      </main>
    </div>
  );
}
