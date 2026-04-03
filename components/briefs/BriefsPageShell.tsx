"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, FileText, X } from "lucide-react";
import ToastProvider from "@/components/ui/ToastProvider";
import BriefIntakeForm from "./BriefIntakeForm";
import BriefList from "./BriefList";
import type { BriefItem } from "./BriefList";

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

interface BriefsPageShellProps {
  initialBriefs: BriefItem[];
  clients: ClientOption[];
}

export default function BriefsPageShell(props: BriefsPageShellProps) {
  return (
    <ToastProvider>
      <BriefsPageShellInner {...props} />
    </ToastProvider>
  );
}

function BriefsPageShellInner({ initialBriefs, clients }: BriefsPageShellProps) {
  const [briefs, setBriefs] = useState<BriefItem[]>(initialBriefs);
  const [modalOpen, setModalOpen] = useState(false);

  const refreshBriefs = useCallback(async () => {
    try {
      const res = await fetch("/api/briefs");
      if (res.ok) {
        const data = await res.json();
        setBriefs(data);
      }
    } catch { /* silent */ }
  }, []);

  const stats = {
    total: briefs.length,
    intake: briefs.filter((b) => b.status === "intake").length,
    parsed: briefs.filter((b) => b.status === "parsed").length,
    assigned: briefs.filter((b) => b.status === "assigned" || b.status === "in_progress").length,
    done: briefs.filter((b) => b.status === "script_uploaded").length,
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] transition-colors duration-300">
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[var(--accent-primary)]" />
          <h1 className="text-lg font-semibold text-[var(--text)]">Content Briefs</h1>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 transition-colors"
        >
          <Plus size={14} />
          New Brief
        </button>
      </header>

      <div className="flex items-center gap-6 px-6 py-3 border-b border-[var(--border)]">
        <StatPill label="Total" value={stats.total} />
        <StatPill label="Intake" value={stats.intake} color="blue" />
        <StatPill label="Parsed" value={stats.parsed} color="purple" />
        <StatPill label="In Progress" value={stats.assigned} color="cyan" />
        <StatPill label="Done" value={stats.done} color="green" />
      </div>

      <div className="p-6">
        <BriefList briefs={briefs} onRefresh={refreshBriefs} />
      </div>

      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] px-4 overflow-y-auto"
          >
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-2xl bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden mb-8"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-[var(--accent-primary)]" />
                  <h2 className="text-sm font-semibold text-[var(--text)]">New Content Brief</h2>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="px-6 py-5 max-h-[75vh] overflow-y-auto">
                <BriefIntakeForm
                  clients={clients}
                  onClose={() => setModalOpen(false)}
                  onBriefCreated={() => {
                    refreshBriefs();
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400",
    purple: "text-purple-400",
    cyan: "text-cyan-400",
    green: "text-[var(--accent-success)]",
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">{label}</span>
      <span className={`text-sm font-bold ${color ? colorMap[color] : "text-[var(--text)]"}`}>{value}</span>
    </div>
  );
}
