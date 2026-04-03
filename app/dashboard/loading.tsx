import SkeletonCard from "@/components/dashboard/SkeletonCard";

const columns = ["Draft", "Pending Review", "Changes Requested", "Approved", "Overdue", "Rejected"];

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex">
      {/* Sidebar skeleton */}
      <aside className="fixed left-0 top-0 h-screen w-[220px] bg-[var(--card)] border-r border-[var(--border)] z-40">
        <div className="px-4 pt-5 pb-6">
          <div className="h-4 w-16 bg-[var(--surface-elevated)] rounded" />
          <div className="h-2 w-20 bg-[var(--surface-elevated)] rounded mt-2 opacity-50" />
        </div>
        <div className="px-2 space-y-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 bg-[var(--surface-elevated)] rounded animate-pulse" />
          ))}
        </div>
      </aside>

      <main className="flex-1 ml-[220px] min-h-screen">
        <header className="flex items-center justify-between h-14 px-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="h-4 w-20 bg-[var(--surface-elevated)] rounded" />
            <div className="h-3 w-24 bg-[var(--surface-elevated)] rounded opacity-50" />
          </div>
        </header>

        <div className="p-6 overflow-x-auto">
          <div className="flex gap-4 min-w-max">
            {columns.map((col) => (
              <div key={col} className="flex flex-col border-l border-[var(--border)] pl-4 w-[280px] shrink-0">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-1.5 h-1.5 bg-[var(--muted)] opacity-50" />
                  <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--muted)]">
                    {col}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
