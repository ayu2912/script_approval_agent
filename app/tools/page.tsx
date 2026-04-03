import AppSidebar from "@/components/shared/AppSidebar";
import { HardDrive, BookOpen, Table2, Instagram, Youtube } from "lucide-react";

const integrations = [
  { icon: HardDrive, name: "Google Drive", desc: "Sync scripts and assets from shared drives", connected: true },
  { icon: BookOpen, name: "Notion", desc: "Pull briefs and content calendars automatically", connected: true },
  { icon: Table2, name: "Airtable", desc: "Two-way sync with production tracking bases", connected: true },
  { icon: Instagram, name: "Instagram API", desc: "Post performance metrics and scheduling", connected: !!process.env.INSTAGRAM_ACCESS_TOKEN },
  { icon: Youtube, name: "YouTube API", desc: "Upload status and analytics integration", connected: !!process.env.YOUTUBE_API_KEY },
];

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex transition-colors duration-300">
      <AppSidebar />
      <main className="flex-1 ml-[220px] min-h-screen">
        <header className="flex items-center gap-4 px-6 h-14 border-b border-[var(--border)]">
          <h1 className="text-sm font-medium text-[var(--text)]">Integrations</h1>
        </header>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((item) => (
              <div key={item.name} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <item.icon size={18} className="text-[var(--text)]" />
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${item.connected ? "bg-emerald-500/10 text-emerald-500" : "bg-[var(--surface-elevated)] text-[var(--muted)]"}`}>
                    {item.connected ? "Connected" : "Coming Soon"}
                  </span>
                </div>
                <div>
                  <h3 className="text-[13px] font-medium text-[var(--text)]">{item.name}</h3>
                  <p className="text-[11px] text-[var(--muted)] mt-1">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
