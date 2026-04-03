import AppSidebar from "@/components/shared/AppSidebar";

const stack = ["Next.js 16", "Supabase", "LangGraph", "Claude", "Resend", "Twilio"];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex transition-colors duration-300">
      <AppSidebar />
      <main className="flex-1 ml-[220px] min-h-screen">
        <header className="flex items-center gap-4 px-6 h-14 border-b border-[var(--border)]">
          <h1 className="text-sm font-medium text-[var(--text)]">About Greenlit</h1>
        </header>
        <div className="p-6 max-w-2xl">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 mb-6">
            <p className="text-[13px] text-[var(--text)] leading-relaxed mb-4">
              Greenlit is an AI-powered content approval platform built for content agencies. It automates script review follow-ups with human-in-the-loop oversight, ensuring no deliverable falls through the cracks.
            </p>
            <p className="text-[13px] text-[var(--muted)] leading-relaxed">
              AI agents detect overdue reviews, draft personalized chase messages, and queue everything for human approval before sending. Clients receive one-click review links to provide feedback directly.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 mb-6">
            <h2 className="text-[13px] font-medium text-[var(--text)] mb-3">Tech Stack</h2>
            <div className="flex flex-wrap gap-2">
              {stack.map((t) => (
                <span key={t} className="text-[11px] font-medium text-[var(--accent-primary)] bg-[var(--surface-elevated)] px-2.5 py-1 rounded-full border border-[var(--border)]">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--muted)]">Built by ruskaruma</span>
            <a href="#" className="text-[11px] text-[var(--accent-primary)] hover:underline">GitHub</a>
          </div>
        </div>
      </main>
    </div>
  );
}
