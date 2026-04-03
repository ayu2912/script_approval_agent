"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Loader2, AlertTriangle, Search, X, Lightbulb, Archive, ArchiveRestore, XCircle, RotateCcw, UserPlus, FileText, Upload } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./Sidebar";
import KanbanBoard from "./KanbanBoard";
import StatsBar from "./StatsBar";
import UploadModal from "./UploadModal";
import RunAgentButton from "./RunAgentButton";
import StatusBadge from "@/components/ui/StatusBadge";
import ToastProvider from "@/components/ui/ToastProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { useClientEdit } from "@/components/ClientEditProvider";
import { formatTimeAgo, isOverdue } from "@/lib/utils";
import type { ScriptWithClient, ScriptStatus } from "@/lib/supabase/types";

export interface ClientItem {
  id: string;
  name: string;
  email: string;
  whatsapp_number: string | null;
  preferred_channel: string;
  monthly_volume: number | null;
  total_scripts: number | null;
}

interface Theme {
  label: string;
  count: number;
  example: string;
}

interface DashboardShellProps {
  scripts: ScriptWithClient[];
  clients: ClientItem[];
  inReview: number;
  overdueCount: number;
  isSandbox?: boolean;
}

export default function DashboardShell(props: DashboardShellProps) {
  return (
    <ToastProvider>
      <DashboardShellInner {...props} />
    </ToastProvider>
  );
}

function DashboardShellInner({
  scripts,
  clients: initialClients,
  isSandbox,
}: DashboardShellProps) {
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [clients, setClients] = useState(initialClients);
  const [localScripts, setLocalScripts] = useState<ScriptWithClient[]>(scripts);
  const [connected, setConnected] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [checkingOverdue, setCheckingOverdue] = useState(false);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [archivedDrawerOpen, setArchivedDrawerOpen] = useState(false);
  const [closedDrawerOpen, setClosedDrawerOpen] = useState(false);
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const { toast } = useToast();
  const { openEditDrawer } = useClientEdit();

  useEffect(() => {
    setLocalScripts(scripts);
  }, [scripts]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/clients");
      if (res.ok) {
        const data = await res.json();
        const newClients: ClientItem[] = data.map((c: ClientItem) => ({
          id: c.id, name: c.name, email: c.email,
          whatsapp_number: c.whatsapp_number, preferred_channel: c.preferred_channel,
        }));
        setClients(newClients);
        setActiveClientId((prev) => prev && !newClients.some((c) => c.id === prev) ? null : prev);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const handler = () => fetchClients();
    window.addEventListener("client-updated", handler);
    return () => window.removeEventListener("client-updated", handler);
  }, [fetchClients]);

  useEffect(() => { setClients(initialClients); }, [initialClients]);

  useEffect(() => {
    fetch("/api/scripts/insights")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.themes?.length > 0) setThemes(data.themes); })
      .catch(() => {});
  }, []);

  const filteredScripts = activeClientId
    ? localScripts.filter((s) => s.client_id === activeClientId)
    : localScripts;

  const displayScripts = filteredScripts.filter((s) => !s.archived && s.status !== "closed");
  const archivedScripts = filteredScripts.filter((s) => s.archived);
  const closedScripts = filteredScripts.filter((s) => !s.archived && s.status === "closed");

  const searchedScripts = useMemo(() => {
    if (!debouncedQuery) return displayScripts;
    const q = debouncedQuery.toLowerCase();
    return displayScripts.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      s.client.name.toLowerCase().includes(q) ||
      (s.client.company && s.client.company.toLowerCase().includes(q))
    );
  }, [displayScripts, debouncedQuery]);

  const stats = useMemo(() => {
    const active = displayScripts.length;
    const inReview = displayScripts.filter((s) => s.status === "pending_review" || s.status === "changes_requested").length;
    const overdue = displayScripts.filter((s) => s.status === "overdue" || isOverdue(s.sent_at, s.status, s.response_deadline_minutes)).length;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const approvedThisWeek = localScripts.filter((s) => s.status === "approved" && s.updated_at >= weekAgo).length;
    const reviewed = localScripts.filter((s) => s.reviewed_at);
    let avgResponseHours: number | null = null;
    if (reviewed.length > 0) {
      const total = reviewed.reduce((sum, s) => {
        const sent = new Date(s.sent_at || s.created_at).getTime();
        const rev = new Date(s.reviewed_at!).getTime();
        return sum + (rev - sent) / 3600000;
      }, 0);
      avgResponseHours = total / reviewed.length;
    }
    return { active, inReview, overdue, approvedThisWeek, avgResponseHours };
  }, [displayScripts, localScripts]);

  const handleScriptUploaded = useCallback(() => { setRefreshKey((k) => k + 1); }, []);

  const handleCheckOverdue = useCallback(async () => {
    setCheckingOverdue(true);
    try {
      const res = await fetch("/api/agent/run?mode=scan");
      if (!res.ok) {
        const data = await res.json();
        toast("error", data.error || "Failed to check overdue scripts");
        return;
      }
      const data = await res.json();
      const count = data.updated ?? 0;
      toast(count === 0 ? "success" : "info",
        count === 0 ? "All scripts are on track." : `Found ${count} overdue script${count > 1 ? "s" : ""}. Use Run Agent on individual cards to generate follow-ups.`
      );
      setRefreshKey((k) => k + 1);
    } catch {
      toast("error", "Failed to check overdue scripts");
    } finally {
      setCheckingOverdue(false);
    }
  }, [toast]);

  const handleArchive = useCallback((id: string, archived: boolean) => {
    setLocalScripts((prev) => prev.map((s) => s.id === id ? { ...s, archived } : s));
  }, []);

  const handleStatusChange = useCallback((id: string, status: ScriptStatus) => {
    setLocalScripts((prev) => prev.map((s) => s.id === id ? { ...s, status } : s));
  }, []);

  async function handleReopen(id: string) {
    setReopeningId(id);
    try {
      const res = await fetch(`/api/scripts/${id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      if (res.ok) {
        toast("success", "Script reopened as draft");
        handleStatusChange(id, "draft");
        setRefreshKey((k) => k + 1);
      } else toast("error", "Failed to reopen script");
    } catch { toast("error", "Failed to reopen script"); }
    finally { setReopeningId(null); }
  }

  async function handleUnarchive(id: string) {
    setUnarchivingId(id);
    try {
      const res = await fetch(`/api/scripts/${id}/archive`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      if (res.ok) {
        toast("success", "Script unarchived");
        handleArchive(id, false);
        setRefreshKey((k) => k + 1);
      } else toast("error", "Failed to unarchive");
    } catch { toast("error", "Failed to unarchive"); }
    finally { setUnarchivingId(null); }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex">
      <Sidebar
        clients={clients}
        onClientFilter={setActiveClientId}
        activeClientId={activeClientId}
        onClientsChange={fetchClients}
        onEditClient={openEditDrawer}
      />

      <main className="flex-1 md:ml-[220px] ml-0 min-h-screen">
        {isSandbox && (
          <div className="flex items-center gap-2 px-6 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400">
            <AlertTriangle size={12} />
            <span>WhatsApp is in sandbox mode. Clients must text &quot;join&quot; followed by the sandbox word to +14155238886 before receiving messages.</span>
          </div>
        )}

        {clients.length === 0 && localScripts.length === 0 ? (
          <div className="flex items-center justify-center min-h-[80vh]">
            <div className="max-w-lg w-full px-6">
              <h2 className="text-lg font-semibold text-[var(--text)] mb-1 text-center">Get started</h2>
              <p className="text-xs text-[var(--muted)] mb-8 text-center">Set up your first client, create a brief, then upload scripts.</p>
              <div className="grid gap-4">
                <Link
                  href="/onboarding"
                  className="flex items-center gap-4 p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--surface-elevated)] transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] flex items-center justify-center shrink-0 group-hover:border-[var(--accent-primary)]/40">
                    <UserPlus size={18} className="text-[var(--accent-primary)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">Onboard your first client</p>
                    <p className="text-[11px] text-[var(--muted)] mt-0.5">Add client details, brand voice, and contact preferences</p>
                  </div>
                </Link>
                <Link
                  href="/briefs"
                  className="flex items-center gap-4 p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--surface-elevated)] transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] flex items-center justify-center shrink-0 group-hover:border-[var(--accent-primary)]/40">
                    <FileText size={18} className="text-[var(--accent-primary)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">Create a content brief</p>
                    <p className="text-[11px] text-[var(--muted)] mt-0.5">Define deliverables, deadlines, and platform requirements</p>
                  </div>
                </Link>
                <div
                  className="flex items-center gap-4 p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] opacity-40 cursor-not-allowed"
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] flex items-center justify-center shrink-0">
                    <Upload size={18} className="text-[var(--muted)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">Upload a script</p>
                    <p className="text-[11px] text-[var(--muted)] mt-0.5">Onboard a client first, then upload scripts for review</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
        <>
        <header className="flex flex-wrap items-center justify-between gap-2 min-h-[56px] px-4 md:px-6 py-2 md:py-0 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-[var(--text)]">Dashboard</h2>
            <div className="flex items-center gap-1.5 ml-2">
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[var(--accent-success)]" : "bg-red-400"}`} />
              <span className="text-[11px] text-[var(--muted)]">{connected ? "Live" : "Disconnected"}</span>
            </div>
            <button
              onClick={() => { setClosedDrawerOpen(false); setArchivedDrawerOpen((v) => !v); }}
              className={`ml-3 text-[11px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1.5 ${
                archivedDrawerOpen
                  ? "border-[var(--muted)]/30 text-[var(--text)] bg-[var(--surface-elevated)]"
                  : "border-[var(--border)] text-[var(--muted)] opacity-50 hover:opacity-100"
              }`}
            >
              <Archive size={10} />
              {archivedDrawerOpen ? "Hide archived" : `Archived (${archivedScripts.length})`}
            </button>
            <button
              onClick={() => { setArchivedDrawerOpen(false); setClosedDrawerOpen((v) => !v); }}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1.5 ${
                closedDrawerOpen
                  ? "border-[var(--muted)]/30 text-[var(--text)] bg-[var(--surface-elevated)]"
                  : "border-[var(--border)] text-[var(--muted)] opacity-50 hover:opacity-100"
              }`}
            >
              <XCircle size={10} />
              {closedDrawerOpen ? "Hide closed" : `Closed (${closedScripts.length})`}
            </button>
            {themes.length > 0 && (
              <button
                onClick={() => setInsightsOpen(true)}
                className="ml-2 flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
              >
                <Lightbulb size={11} />
                Top revision reason: {themes[0].label} ({themes[0].count}x)
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCheckOverdue}
              disabled={checkingOverdue}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)] disabled:opacity-40"
            >
              {checkingOverdue ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              Check Overdue
            </button>
            <RunAgentButton
              scripts={displayScripts.map((s) => ({
                id: s.id, title: s.title, status: s.status, sent_at: s.sent_at,
                client_name: s.client.name, due_date: s.due_date, response_deadline_minutes: s.response_deadline_minutes,
              }))}
              mode="batch"
            />
            <UploadModal clients={clients} onScriptUploaded={handleScriptUploaded} />
          </div>
        </header>

        <StatsBar
          active={stats.active}
          inReview={stats.inReview}
          overdue={stats.overdue}
          approvedThisWeek={stats.approvedThisWeek}
          avgResponseHours={stats.avgResponseHours}
        />

        <div className="flex items-center gap-2 px-6 py-3 border-b border-[var(--border)]">
          <Search size={14} className="text-[var(--muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scripts by title or client..."
            className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--muted)] placeholder:opacity-50 outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-[var(--muted)] hover:text-[var(--text)]">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="p-6 overflow-x-auto">
          <KanbanBoard
            initialScripts={searchedScripts}
            onConnectionChange={setConnected}
            refreshKey={refreshKey}
            onArchive={handleArchive}
            activeClientId={activeClientId}
          />
        </div>
        </>
        )}
      </main>

      <AnimatePresence>
        {archivedDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => setArchivedDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-screen w-full max-w-md z-50 bg-[var(--card)] border-l border-[var(--border)] flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Archive size={14} className="text-[var(--muted)]" />
                  <h2 className="text-sm font-semibold text-[var(--text)]">Archived Scripts</h2>
                  <span className="text-[10px] text-[var(--muted)] opacity-60 bg-[var(--surface-elevated)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                    {archivedScripts.length}
                  </span>
                </div>
                <button onClick={() => setArchivedDrawerOpen(false)} className="text-[var(--muted)] hover:text-[var(--text)] shrink-0">
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {archivedScripts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Archive size={20} className="text-[var(--muted)] opacity-30 mb-3" />
                    <p className="text-sm text-[var(--muted)] opacity-60">No archived scripts</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {archivedScripts.map((script) => (
                      <div key={script.id} className="p-4 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-sm font-medium text-[var(--text)] truncate">{script.title}</h3>
                          <StatusBadge status={script.status} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-3">
                          <span>{script.client.name}</span>
                          {script.client.company && <span className="opacity-60">/ {script.client.company}</span>}
                          {script.sent_at && (
                            <>
                              <span className="opacity-30">&middot;</span>
                              <span className="opacity-60">Sent {formatTimeAgo(script.sent_at)}</span>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => handleUnarchive(script.id)}
                          disabled={unarchivingId === script.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)] disabled:opacity-40"
                        >
                          {unarchivingId === script.id ? <Loader2 size={11} className="animate-spin" /> : <ArchiveRestore size={11} />}
                          Unarchive
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {closedDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => setClosedDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-screen w-full max-w-md z-50 bg-[var(--card)] border-l border-[var(--border)] flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <XCircle size={14} className="text-[var(--muted)]" />
                  <h2 className="text-sm font-semibold text-[var(--text)]">Closed Scripts</h2>
                  <span className="text-[10px] text-[var(--muted)] opacity-60 bg-[var(--surface-elevated)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                    {closedScripts.length}
                  </span>
                </div>
                <button onClick={() => setClosedDrawerOpen(false)} className="text-[var(--muted)] hover:text-[var(--text)] shrink-0">
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {closedScripts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <XCircle size={20} className="text-[var(--muted)] opacity-30 mb-3" />
                    <p className="text-sm text-[var(--muted)] opacity-60">No closed scripts</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {closedScripts.map((script) => (
                      <div key={script.id} className="p-4 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-sm font-medium text-[var(--text)] truncate">{script.title}</h3>
                          <StatusBadge status={script.status} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-3">
                          <span>{script.client.name}</span>
                          {script.client.company && <span className="opacity-60">/ {script.client.company}</span>}
                          {script.sent_at && (
                            <>
                              <span className="opacity-30">&middot;</span>
                              <span className="opacity-60">Sent {formatTimeAgo(script.sent_at)}</span>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => handleReopen(script.id)}
                          disabled={reopeningId === script.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)] disabled:opacity-40"
                        >
                          {reopeningId === script.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                          Reopen
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {insightsOpen && themes.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setInsightsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Lightbulb size={14} className="text-amber-400" />
                  <h3 className="text-sm font-semibold text-[var(--text)]">Revision Insights</h3>
                </div>
                <button onClick={() => setInsightsOpen(false)} className="text-[var(--muted)] hover:text-[var(--text)]">
                  <X size={14} />
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <p className="text-xs text-[var(--muted)]">Top revision themes from the last 30 days:</p>
                {themes.map((theme) => (
                  <div key={theme.label} className="bg-[var(--input-bg)] border border-[var(--border)] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-[var(--text)]">{theme.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {theme.count}x
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">&ldquo;{theme.example}&rdquo;</p>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-[var(--border)]">
                <button
                  onClick={() => setInsightsOpen(false)}
                  className="w-full px-4 py-2 rounded text-xs font-medium border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-elevated)]"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
