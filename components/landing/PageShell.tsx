"use client";

import Link from "next/link";
import ThemeToggle from "@/components/dashboard/ThemeToggle";

export default function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <nav className="flex items-center justify-between px-6 md:px-10 py-4 shrink-0">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[var(--accent-primary)] flex items-center justify-center">
            <span className="text-white text-xs font-bold">G</span>
          </div>
          <span className="text-sm font-semibold text-[var(--text)] tracking-wide">Greenlit</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <Link href="/about" className="text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] hover:text-[var(--text)] transition-colors">About</Link>
          <Link href="/tools" className="text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] hover:text-[var(--text)] transition-colors">Tools</Link>
          <Link href="/workflow" className="text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] hover:text-[var(--text)] transition-colors">Workflow</Link>
          <Link href="/writeup" className="text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] hover:text-[var(--text)] transition-colors">Writeup</Link>
          <Link href="https://github.com/ruskaruma/greenlit" target="_blank" className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className="px-4 py-1.5 rounded-md text-[11px] font-semibold tracking-wide border border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-white transition-colors cursor-pointer">
            GET STARTED
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="max-w-2xl mx-auto w-full text-center">
          <h1
            className="text-3xl md:text-4xl font-bold text-[var(--text)] mb-6 tracking-tight"
            style={{ fontFamily: "var(--font-playfair), serif" }}
          >
            {title}
          </h1>
          {children}
        </div>
      </main>

      <footer className="py-4 text-center shrink-0">
        <p className="text-[11px] text-[var(--muted)] opacity-50">by ruskaruma &middot; for Scrollhouse</p>
      </footer>
    </div>
  );
}
