"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import {
  Mail,
  Phone,
  MessageSquare,
  User,
  Calendar,
  Briefcase,
  Hash,
  AlertTriangle,
  Loader2,
  ArrowUpDown,
} from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import ScriptDetailSheet from "@/components/dashboard/ScriptDetailSheet";
import { cn, formatTimeAgo } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastProvider";
import type {
  Client,
  Script,
  ClientMemory,
  ScriptStatus,
  ScriptWithClient,
  MemoryType,
} from "@/lib/supabase/types";

interface ScriptWithChaserCount extends Script {
  chaser_count: number;
}

interface ClientDetailPanelProps {
  client: Client;
  scripts: ScriptWithChaserCount[];
  feedbackScripts: ScriptWithChaserCount[];
  memories: ClientMemory[];
}

type Tab = "scripts" | "feedback" | "memory";
type SortField = "created_at" | "status";
type SortDir = "asc" | "desc";

const MEMORY_CONSOLIDATION_THRESHOLD = 15;

const TAB_OPTIONS: { key: Tab; label: string }[] = [
  { key: "scripts", label: "Scripts" },
  { key: "feedback", label: "Feedback Timeline" },
  { key: "memory", label: "Memory" },
];

const MEMORY_TYPE_COLORS: Record<MemoryType, string> = {
  feedback: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  approval: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  rejection: "bg-red-500/10 text-red-400 border-red-500/20",
  behavioral_pattern: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  chaser_sent: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  client_response: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  hitl_instruction: "bg-pink-500/10 text-pink-400 border-pink-500/20",
};

function formatApprovalTime(sentAt: string | null, reviewedAt: string | null): string {
  if (!sentAt || !reviewedAt) return "—";
  const diffMs = new Date(reviewedAt).getTime() - new Date(sentAt).getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 1) return `${Math.round(diffHours * 60)}m`;
  if (diffHours < 24) return `${Math.round(diffHours)}h`;
  return `${Math.round(diffHours / 24)}d`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ClientDetailPanel({
  client,
  scripts,
  feedbackScripts,
  memories,
}: ClientDetailPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("scripts");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedScript, setSelectedScript] = useState<ScriptWithChaserCount | null>(null);
  const [consolidating, setConsolidating] = useState(false);

  const sortedScripts = useMemo(() => {
    const sorted = [...scripts].sort((a, b) => {
      if (sortField === "created_at") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return a.status.localeCompare(b.status);
    });
    return sortDir === "desc" ? sorted.reverse() : sorted;
  }, [scripts, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function handleStatusChange(scriptId: string, newStatus: ScriptStatus) {
    if (selectedScript && selectedScript.id === scriptId) {
      setSelectedScript({ ...selectedScript, status: newStatus });
    }
  }

  function handleScriptUpdated() {
    router.refresh();
  }

  async function handleConsolidate() {
    setConsolidating(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/consolidate-memory`, {
        method: "POST",
      });
      if (res.ok) {
        toast("success", "Memories consolidated");
        router.refresh();
      } else {
        const data = await res.json();
        toast("error", data.error || "Consolidation failed");
      }
    } catch {
      toast("error", "Consolidation failed");
    } finally {
      setConsolidating(false);
    }
  }

  const sheetScript: ScriptWithClient | null = selectedScript
    ? { ...selectedScript, client }
    : null;

  const stats = [
    { label: "Total Scripts", value: client.total_scripts },
    { label: "Approved", value: client.approved_count },
    { label: "Rejected", value: client.rejected_count },
    { label: "Changes Req.", value: client.changes_requested_count },
  ];

  const profileFields = [
    { icon: Mail, label: "Email", value: client.email },
    { icon: Phone, label: "WhatsApp", value: client.whatsapp_number },
    { icon: MessageSquare, label: "Channel", value: client.preferred_channel },
    { icon: User, label: "Account Manager", value: client.account_manager },
    { icon: Calendar, label: "Contract Start", value: formatDate(client.contract_start) },
    { icon: Briefcase, label: "Brand Voice", value: client.brand_voice },
    { icon: Hash, label: "Monthly Volume", value: client.monthly_volume?.toString() },
  ];

  return (
    <>
      <header className="flex items-center gap-4 px-6 h-14 border-b border-[var(--border)]">
        <h1 className="text-sm font-medium text-[var(--text)]">{client.name}</h1>
        {client.company && (
          <span className="text-[11px] text-[var(--muted)]">{client.company}</span>
        )}
      </header>

      <div className="px-6 py-6 space-y-6">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-3">
            {profileFields.map((field) => {
              if (!field.value || field.value === "—") return null;
              const Icon = field.icon;
              return (
                <div key={field.label} className="flex items-start gap-2">
                  <Icon size={13} className="text-[var(--muted)] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] opacity-60">
                      {field.label}
                    </p>
                    <p className="text-[13px] text-[var(--text)]">{field.value}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {client.platform_focus && client.platform_focus.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] opacity-60">
                Platforms
              </span>
              <div className="flex gap-1.5">
                {client.platform_focus.map((p) => (
                  <span
                    key={p}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--muted)]"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-[var(--border)]">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] opacity-60">
                  {s.label}
                </p>
                <p className="text-lg font-semibold text-[var(--text)]">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-1 border-b border-[var(--border)]">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-4 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab.key
                  ? "border-[var(--accent-primary)] text-[var(--text)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "scripts" && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
            {scripts.length === 0 ? (
              <p className="text-[11px] text-[var(--muted)] px-4 py-6 text-center">
                No scripts yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-[10px] uppercase tracking-wider text-[var(--muted)] opacity-60 font-medium px-4 py-2.5">
                        Title
                      </th>
                      <th className="text-[10px] uppercase tracking-wider text-[var(--muted)] opacity-60 font-medium px-4 py-2.5">
                        <button
                          onClick={() => toggleSort("status")}
                          className="flex items-center gap-1 hover:text-[var(--text)]"
                        >
                          Status
                          <ArrowUpDown size={10} />
                        </button>
                      </th>
                      <th className="text-[10px] uppercase tracking-wider text-[var(--muted)] opacity-60 font-medium px-4 py-2.5">
                        Quality
                      </th>
                      <th className="text-[10px] uppercase tracking-wider text-[var(--muted)] opacity-60 font-medium px-4 py-2.5">
                        <button
                          onClick={() => toggleSort("created_at")}
                          className="flex items-center gap-1 hover:text-[var(--text)]"
                        >
                          Sent
                          <ArrowUpDown size={10} />
                        </button>
                      </th>
                      <th className="text-[10px] uppercase tracking-wider text-[var(--muted)] opacity-60 font-medium px-4 py-2.5">
                        Turnaround
                      </th>
                      <th className="text-[10px] uppercase tracking-wider text-[var(--muted)] opacity-60 font-medium px-4 py-2.5">
                        Chasers
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {sortedScripts.map((script) => (
                      <tr
                        key={script.id}
                        onClick={() => setSelectedScript(script)}
                        className="hover:bg-[var(--surface-elevated)] cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2.5 text-[13px] text-[var(--text)] font-medium truncate max-w-[200px]">
                          {script.title}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={script.status} />
                        </td>
                        <td className="px-4 py-2.5">
                          {script.quality_score ? (
                            <span
                              className={cn(
                                "text-[11px] font-medium",
                                script.quality_score.average >= 8
                                  ? "text-emerald-400"
                                  : script.quality_score.average >= 5
                                    ? "text-amber-400"
                                    : "text-red-400"
                              )}
                            >
                              {script.quality_score.average}/10
                            </span>
                          ) : (
                            <span className="text-[11px] text-[var(--muted)] opacity-40">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-[var(--muted)]">
                          {script.sent_at ? formatTimeAgo(script.sent_at) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-[var(--muted)]">
                          {formatApprovalTime(script.sent_at, script.reviewed_at)}
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-[var(--muted)]">
                          {script.chaser_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "feedback" && (
          <div className="space-y-3">
            {feedbackScripts.length === 0 ? (
              <p className="text-[11px] text-[var(--muted)] text-center py-8">
                No feedback from this client yet
              </p>
            ) : (
              feedbackScripts
                .sort(
                  (a, b) =>
                    new Date(b.reviewed_at ?? b.created_at).getTime() -
                    new Date(a.reviewed_at ?? a.created_at).getTime()
                )
                .map((script) => (
                  <div
                    key={script.id}
                    className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-5 py-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium text-[var(--text)]">
                          {script.title}
                        </p>
                        <StatusBadge status={script.status} />
                      </div>
                      <span className="text-[10px] text-[var(--muted)]">
                        {formatDate(script.reviewed_at)}
                      </span>
                    </div>
                    <p className="text-[13px] text-[var(--text)] opacity-80 leading-relaxed">
                      {script.client_feedback}
                    </p>
                  </div>
                ))
            )}
          </div>
        )}

        {activeTab === "memory" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-[var(--muted)]">
                {memories.length} {memories.length === 1 ? "entry" : "entries"}
              </p>
            </div>

            {memories.length > MEMORY_CONSOLIDATION_THRESHOLD && (
              <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-3">
                <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] text-[var(--text)] font-medium">
                    {memories.length} memories stored — consider consolidating
                  </p>
                  <p className="text-[10px] text-[var(--muted)] mt-0.5">
                    Too many entries can reduce retrieval quality. Consolidation merges
                    redundant memories into fewer, higher-quality entries.
                  </p>
                  <button
                    onClick={handleConsolidate}
                    disabled={consolidating}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    {consolidating && <Loader2 size={11} className="animate-spin" />}
                    {consolidating ? "Consolidating..." : "Consolidate Now"}
                  </button>
                </div>
              </div>
            )}

            {memories.length === 0 ? (
              <p className="text-[11px] text-[var(--muted)] text-center py-8">
                No memories recorded for this client
              </p>
            ) : (
              memories.map((memory) => (
                <div
                  key={memory.id}
                  className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-5 py-4"
                >
                  <p className="text-[13px] text-[var(--text)] leading-relaxed">
                    {memory.content}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full border",
                        MEMORY_TYPE_COLORS[memory.memory_type] ??
                          "bg-[var(--surface-elevated)] text-[var(--muted)] border-[var(--border)]"
                      )}
                    >
                      {memory.memory_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] text-[var(--muted)]">
                      {formatTimeAgo(memory.created_at)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {sheetScript && (
          <ScriptDetailSheet
            script={sheetScript}
            onClose={() => setSelectedScript(null)}
            onStatusChange={handleStatusChange}
            onScriptUpdated={handleScriptUpdated}
          />
        )}
      </AnimatePresence>
    </>
  );
}
