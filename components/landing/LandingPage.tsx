"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Search,
  Activity,
  GitBranch,
  PenTool,
  ShieldCheck,
  RefreshCw,
  UserCheck,
  BarChart3,
  GraduationCap,
  Brain,
  AlertTriangle,
  UserPlus,
  FileText,
  RotateCcw,
  ChevronRight,
  FolderOpen,
  BookOpen,
  Table2,
  Camera,
  Youtube,
  Mail,
  MessageSquare,
} from "lucide-react";
import ThemeToggle from "@/components/dashboard/ThemeToggle";

const words = ["AI-POWERED", "SCRIPT", "APPROVAL", "ENGINE"];

const badges = [
  "LANGGRAPH AGENT",
  "HITL REVIEW",
  "6D SCORING",
  "FEW-SHOT LEARNING",
  "MULTI-CHANNEL",
  "AUTO-ESCALATION",
];

const pipelineSteps = [
  { icon: Search, label: "RAG Retrieval" },
  { icon: Activity, label: "Sentiment" },
  { icon: GitBranch, label: "Channel Strategy" },
  { icon: PenTool, label: "Generation" },
  { icon: ShieldCheck, label: "Self-Critique" },
  { icon: RefreshCw, label: "Revision" },
  { icon: UserCheck, label: "HITL Review" },
];

const capabilities = [
  {
    icon: UserCheck,
    title: "Human-in-the-Loop",
    desc: "LangGraph interrupt() pauses the pipeline. Team leads review, edit, or reject every AI draft before delivery. State persisted across sessions.",
  },
  {
    icon: BarChart3,
    title: "Quality Scoring",
    desc: "6-dimension analysis: hook strength, CTA clarity, brand alignment, platform fit, pacing, tone consistency. Binary pass/fail self-critique prevents score inflation.",
  },
  {
    icon: GraduationCap,
    title: "Few-Shot Learning",
    desc: "The agent learns from team lead edits. Last 3 approved examples injected per client to continuously improve future generations.",
  },
  {
    icon: GitBranch,
    title: "Channel Strategy",
    desc: "Sliding-window response-rate comparison between email and WhatsApp. Automatically selects the channel with 20%+ advantage. Escalation sends both.",
  },
  {
    icon: Brain,
    title: "Memory System",
    desc: "RAG retrieval with pgvector embeddings. AI consolidation summarizes 20+ memories into 6 actionable statements using Claude Haiku.",
  },
  {
    icon: AlertTriangle,
    title: "Auto-Escalation",
    desc: "After 3 failed chasers, scripts escalate automatically. Overdue cron job triggers the full agent pipeline on a schedule.",
  },
];

const integrations = [
  { icon: FolderOpen, label: "Google Drive" },
  { icon: BookOpen, label: "Notion" },
  { icon: Table2, label: "Airtable" },
  { icon: Camera, label: "Instagram" },
  { icon: Youtube, label: "YouTube" },
  { icon: Mail, label: "Resend" },
  { icon: MessageSquare, label: "Twilio" },
];

const workflows = [
  {
    icon: UserPlus,
    title: "Client Onboarding",
    desc: "SSE-streamed automation: welcome email, Google Drive folder, Notion page, Airtable record, WhatsApp notification. All optional, graceful skip.",
  },
  {
    icon: FileText,
    title: "Content Briefs",
    desc: "Form intake parsed by Claude into structured briefs. Context-aware: pulls client brand voice and memories for accurate parsing.",
  },
  {
    icon: RotateCcw,
    title: "Review Cycle",
    desc: "Versioned review links via Resend. Each chase bumps the version, generates a new token, and clears stale feedback. One-click approval.",
  },
];

const techStack = [
  "Next.js 16",
  "React 19",
  "Supabase",
  "LangGraph",
  "Claude",
  "pgvector",
  "Resend",
  "Twilio",
];

const sectionAnim = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5 },
};

export default function LandingPage() {
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
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className="px-4 py-1.5 rounded-md text-[11px] font-semibold tracking-wide border border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-white transition-colors cursor-pointer">
            GET STARTED
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center px-6">
        <div className="max-w-5xl mx-auto w-full">

          {/* ── Hero ── */}
          <section className="text-center pt-16 md:pt-24 pb-16 md:pb-20">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-8"
            >
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--border)] text-[11px] tracking-[0.12em] uppercase text-[var(--muted)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                Built for Scrollhouse
              </span>
            </motion.div>

            <h1 className="mb-6">
              {words.map((word, i) => (
                <motion.span
                  key={word}
                  initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ delay: 0.15 + i * 0.1, duration: 0.5 }}
                  className="inline-block mr-3 md:mr-5 text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-[var(--text)]"
                  style={{ fontFamily: "var(--font-playfair), serif" }}
                >
                  {word}
                </motion.span>
              ))}
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="text-sm md:text-base text-[var(--muted)] mb-8 max-w-2xl mx-auto leading-relaxed italic"
            >
              A 7-stage autonomous agent pipeline that drafts, critiques, and
              delivers client chasers — with human oversight at every step,
              few-shot learning from your edits, and multi-channel delivery.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75, duration: 0.4 }}
              className="flex items-center justify-center gap-2 md:gap-3 mb-8 flex-wrap"
            >
              {badges.map((b) => (
                <span key={b} className="px-3 py-1 rounded-full border border-[var(--border)] text-[10px] tracking-[0.1em] uppercase text-[var(--muted)]">
                  {b}
                </span>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.4 }}
            >
              <Link href="/login">
                <motion.span
                  className="inline-block px-8 py-3.5 rounded-lg font-semibold text-base bg-[var(--accent-primary)] text-white cursor-pointer"
                  whileHover={{ scale: 1.03, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                >
                  use greenlit
                </motion.span>
              </Link>
            </motion.div>
          </section>

          {/* ── Agent Pipeline ── */}
          <motion.section {...sectionAnim} className="py-16 md:py-20">
            <div className="text-center mb-10">
              <h2
                className="text-2xl md:text-3xl font-bold text-[var(--text)] mb-2 tracking-tight italic"
                style={{ fontFamily: "var(--font-playfair), serif" }}
              >
                Agent Pipeline
              </h2>
              <p className="text-sm text-[var(--muted)]">
                Seven autonomous stages from memory retrieval to human approval.
              </p>
            </div>

            <div className="flex items-center justify-center gap-1 md:gap-2 overflow-x-auto pb-2">
              {pipelineSteps.map((step, i) => (
                <div key={step.label} className="flex items-center gap-1 md:gap-2 shrink-0">
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.35 }}
                    className="flex flex-col items-center gap-2 px-3 py-3 md:px-5 md:py-4 rounded-lg bg-[var(--card)] border border-[var(--border)] min-w-[80px] md:min-w-[100px]"
                  >
                    <div className="w-8 h-8 rounded-lg border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 flex items-center justify-center">
                      <step.icon size={14} className="text-[var(--accent-primary)]" />
                    </div>
                    <span className="text-[10px] md:text-[11px] text-[var(--muted)] whitespace-nowrap">
                      {step.label}
                    </span>
                  </motion.div>
                  {i < pipelineSteps.length - 1 && (
                    <ChevronRight size={14} className="text-[var(--border)] shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </motion.section>

          {/* ── Core Capabilities ── */}
          <motion.section {...sectionAnim} className="py-16 md:py-20">
            <div className="text-center mb-10">
              <h2
                className="text-2xl md:text-3xl font-bold text-[var(--text)] mb-2 tracking-tight italic"
                style={{ fontFamily: "var(--font-playfair), serif" }}
              >
                Core Capabilities
              </h2>
              <p className="text-sm text-[var(--muted)]">
                Everything the agent does, and how you stay in control.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {capabilities.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className="p-5 rounded-lg bg-[var(--card)] border border-[var(--border)]"
                >
                  <div className="w-9 h-9 rounded-lg border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 flex items-center justify-center mb-4">
                    <f.icon size={18} className="text-[var(--accent-primary)]" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text)] mb-2">{f.title}</h3>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ── Integrations ── */}
          <motion.section {...sectionAnim} className="py-16 md:py-20">
            <div className="text-center mb-10">
              <h2
                className="text-2xl md:text-3xl font-bold text-[var(--text)] mb-2 tracking-tight italic"
                style={{ fontFamily: "var(--font-playfair), serif" }}
              >
                Integrations
              </h2>
              <p className="text-sm text-[var(--muted)]">
                Connected services for onboarding, delivery, and analytics.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              {integrations.map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--border)] bg-[var(--card)]"
                >
                  <item.icon size={14} className="text-[var(--accent-primary)]" />
                  <span className="text-[11px] text-[var(--muted)]">{item.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ── Workflow Highlights ── */}
          <motion.section {...sectionAnim} className="py-16 md:py-20">
            <div className="text-center mb-10">
              <h2
                className="text-2xl md:text-3xl font-bold text-[var(--text)] mb-2 tracking-tight italic"
                style={{ fontFamily: "var(--font-playfair), serif" }}
              >
                End-to-End Workflows
              </h2>
              <p className="text-sm text-[var(--muted)]">
                From onboarding to final approval, fully automated.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {workflows.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className="p-5 rounded-lg bg-[var(--card)] border border-[var(--border)]"
                >
                  <div className="w-9 h-9 rounded-lg border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 flex items-center justify-center mb-4">
                    <f.icon size={18} className="text-[var(--accent-primary)]" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text)] mb-2">{f.title}</h3>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ── Tech Stack ── */}
          <motion.section {...sectionAnim} className="py-12 md:py-16 border-t border-[var(--border)]">
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {techStack.map((t) => (
                <span key={t} className="px-3 py-1 rounded-full border border-[var(--border)] text-[11px] text-[var(--muted)]">
                  {t}
                </span>
              ))}
            </div>
          </motion.section>

          {/* ── CTA Footer ── */}
          <motion.section {...sectionAnim} className="py-16 md:py-24 text-center">
            <h2
              className="text-2xl md:text-3xl font-bold text-[var(--text)] mb-3 tracking-tight italic"
              style={{ fontFamily: "var(--font-playfair), serif" }}
            >
              Ready to automate approvals?
            </h2>
            <p className="text-sm text-[var(--muted)] mb-8 max-w-md mx-auto">
              Set up your pipeline in minutes. Let the agent handle the chasing while you focus on creative.
            </p>
            <Link href="/login">
              <motion.span
                className="inline-block px-8 py-3.5 rounded-lg font-semibold text-base bg-[var(--accent-primary)] text-white cursor-pointer"
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.98 }}
              >
                get started
              </motion.span>
            </Link>
          </motion.section>
        </div>
      </main>

      <footer className="py-4 text-center shrink-0">
        <p className="text-[11px] text-[var(--muted)] opacity-50">by ruskaruma &middot; for Scrollhouse</p>
      </footer>
    </div>
  );
}
