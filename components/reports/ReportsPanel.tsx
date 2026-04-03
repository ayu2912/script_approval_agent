"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, ChevronUp, Loader2, Send, Save, Clock,
  BarChart3, TrendingUp, TrendingDown, Eye, Heart, MessageSquare,
  Users, MousePointer, Share2, Bookmark, Play, Plus, Trash2,
  CheckCircle2, ArrowLeft, ExternalLink, Calendar, Link2,
} from "lucide-react";
import { cn, formatTimeAgo } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastProvider";
import type { ReportPlatform, ReportContentType, ReportEntry, AggregateMetrics } from "@/lib/supabase/types";


interface ClientOption {
  id: string;
  name: string;
  email: string;
  company: string | null;
}

interface ReportRow {
  id: string;
  client_id: string;
  report_title: string;
  period_start: string;
  period_end: string;
  entries: ReportEntry[];
  aggregate_metrics: AggregateMetrics | null;
  previous_aggregate: AggregateMetrics | null;
  generated_summary: string | null;
  recommendations: string | null;
  sent_at: string | null;
  created_at: string;
  client: { name: string; email: string; company: string | null };
}

interface ReportsPanelProps {
  clients: ClientOption[];
  initialReports: ReportRow[];
}

interface EntryForm {
  id: string;
  title: string;
  platform: ReportPlatform;
  content_type: ReportContentType;
  post_url: string;
  post_date: string;
  metrics: Record<string, string>;
  collapsed: boolean;
}


const PLATFORMS: ReportPlatform[] = ["Instagram", "YouTube", "LinkedIn", "TikTok", "X/Twitter"];
const CONTENT_TYPES: ReportContentType[] = ["Video", "Photo", "Carousel", "Story", "Reel", "Post"];

const PLATFORM_METRICS: Record<ReportPlatform, { key: string; label: string; icon: typeof Eye }[]> = {
  Instagram: [
    { key: "views", label: "Views", icon: Eye },
    { key: "reach", label: "Reach", icon: Users },
    { key: "likes", label: "Likes", icon: Heart },
    { key: "comments", label: "Comments", icon: MessageSquare },
    { key: "shares", label: "Shares", icon: Share2 },
    { key: "saves", label: "Saves", icon: Bookmark },
    { key: "engagement_rate", label: "Engagement Rate (%)", icon: TrendingUp },
  ],
  TikTok: [
    { key: "views", label: "Views", icon: Eye },
    { key: "reach", label: "Reach", icon: Users },
    { key: "likes", label: "Likes", icon: Heart },
    { key: "comments", label: "Comments", icon: MessageSquare },
    { key: "shares", label: "Shares", icon: Share2 },
    { key: "saves", label: "Saves", icon: Bookmark },
    { key: "engagement_rate", label: "Engagement Rate (%)", icon: TrendingUp },
  ],
  YouTube: [
    { key: "views", label: "Views", icon: Eye },
    { key: "watch_time", label: "Watch Time (hrs)", icon: Clock },
    { key: "likes", label: "Likes", icon: Heart },
    { key: "comments", label: "Comments", icon: MessageSquare },
    { key: "subscribers_gained", label: "Subs Gained", icon: Users },
    { key: "ctr", label: "CTR (%)", icon: MousePointer },
  ],
  LinkedIn: [
    { key: "impressions", label: "Impressions", icon: Eye },
    { key: "clicks", label: "Clicks", icon: MousePointer },
    { key: "likes", label: "Likes", icon: Heart },
    { key: "comments", label: "Comments", icon: MessageSquare },
    { key: "reposts", label: "Reposts", icon: Share2 },
    { key: "ctr", label: "CTR (%)", icon: MousePointer },
    { key: "engagement_rate", label: "Engagement Rate (%)", icon: TrendingUp },
  ],
  "X/Twitter": [
    { key: "impressions", label: "Impressions", icon: Eye },
    { key: "likes", label: "Likes", icon: Heart },
    { key: "replies", label: "Replies", icon: MessageSquare },
    { key: "reposts", label: "Reposts", icon: Share2 },
    { key: "bookmarks", label: "Bookmarks", icon: Bookmark },
    { key: "clicks", label: "Clicks", icon: MousePointer },
    { key: "engagement_rate", label: "Engagement Rate (%)", icon: TrendingUp },
  ],
};

const METRIC_ICON_MAP: Record<string, typeof Eye> = {
  views: Eye, reach: Users, likes: Heart, comments: MessageSquare,
  shares: Share2, saves: Bookmark, engagement_rate: TrendingUp,
  watch_time: Clock, subscribers_gained: Users, ctr: MousePointer,
  impressions: Eye, clicks: MousePointer, reposts: Share2, replies: MessageSquare,
  bookmarks: Bookmark,
  entry_count: BarChart3,
};

const PLATFORM_COLORS: Record<string, string> = {
  Instagram: "text-pink-400",
  YouTube: "text-red-400",
  LinkedIn: "text-blue-400",
  TikTok: "text-cyan-400",
  "X/Twitter": "text-gray-300",
};


let entryIdCounter = 0;
function newEntryId(): string {
  return `entry-${++entryIdCounter}-${Date.now()}`;
}

function emptyEntry(): EntryForm {
  return {
    id: newEntryId(),
    title: "",
    platform: "Instagram",
    content_type: "Video",
    post_url: "",
    post_date: "",
    metrics: {},
    collapsed: false,
  };
}

function fmtMetricVal(key: string, value: number): string {
  if (key.includes("rate") || key === "ctr") return `${value}%`;
  return value.toLocaleString();
}

function fmtLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function calcChange(current: number, previous: number): { pct: number; direction: "up" | "down" | "flat" } {
  if (current === previous) return { pct: 0, direction: "flat" };
  const pct = previous !== 0 ? Math.round(((current - previous) / previous) * 100) : current > 0 ? 100 : 0;
  return { pct, direction: current > previous ? "up" : "down" };
}

function parseSummaryParts(summary: string): { overview: string; comparison: string } {
  const parts = summary.split("\n\n---COMPARISON---\n");
  return { overview: parts[0] ?? summary, comparison: parts[1] ?? "" };
}

function fmtDateRange(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${s} — ${e}`;
}


export default function ReportsPanel({ clients, initialReports }: ReportsPanelProps) {
  const { toast } = useToast();

  const [reports, setReports] = useState<ReportRow[]>(initialReports);
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);
  const [emailPreview, setEmailPreview] = useState<{ reportId: string; email: string; title: string; period: string; entryCount: number } | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const [reportTitle, setReportTitle] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [entries, setEntries] = useState<EntryForm[]>([emptyEntry()]);

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const [generatedOutput, setGeneratedOutput] = useState<{
    id: string;
    overview: string;
    comparison: string;
    recommendations: string;
  } | null>(null);

  const isAllClients = selectedClientId === "";
  const clientReports = useMemo(
    () => isAllClients ? reports : reports.filter((r) => r.client_id === selectedClientId),
    [reports, selectedClientId, isAllClients]
  );
  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const viewingReport = selectedReportId ? reports.find((r) => r.id === selectedReportId) : null;

  const aggregateStats = useMemo(() => {
    if (!isAllClients) return null;
    const totalEntries = clientReports.reduce((sum, r) => sum + r.entries.length, 0);
    const sentCount = clientReports.filter((r) => r.sent_at).length;
    const draftCount = clientReports.length - sentCount;
    return { totalReports: clientReports.length, totalEntries, sentCount, draftCount };
  }, [isAllClients, clientReports]);



  function handleClientChange(clientId: string) {
    setSelectedClientId(clientId);
    setSelectedReportId(null);
    setGeneratedOutput(null);
    setSelectedIds(new Set());
    resetForm();
  }

  function resetForm() {
    setReportTitle("");
    setPeriodStart("");
    setPeriodEnd("");
    setEntries([emptyEntry()]);
    setGeneratedOutput(null);
  }

  function handleNewReport() {
    setSelectedReportId(null);
    setGeneratedOutput(null);
    resetForm();
  }

  function handleViewReport(report: ReportRow) {
    setSelectedReportId(report.id);
    if (report.generated_summary) {
      const { overview, comparison } = parseSummaryParts(report.generated_summary);
      setGeneratedOutput({
        id: report.id,
        overview,
        comparison,
        recommendations: report.recommendations ?? "",
      });
    } else {
      setGeneratedOutput(null);
    }
  }

  function addEntry() {
    setEntries((prev) => [...prev, emptyEntry()]);
  }

  function removeEntry(id: string) {
    if (entries.length <= 1) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function updateEntry(id: string, updates: Partial<EntryForm>) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const updated = { ...e, ...updates };
        // Clear metrics when platform changes
        if (updates.platform && updates.platform !== e.platform) {
          updated.metrics = {};
        }
        return updated;
      })
    );
  }

  function updateEntryMetric(id: string, key: string, value: string) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, metrics: { ...e.metrics, [key]: value } } : e
      )
    );
  }

  function toggleEntryCollapse(id: string) {
    setEntries((prev) =>
      prev.map((e) => e.id === id ? { ...e, collapsed: !e.collapsed } : e)
    );
  }

  function buildEntries(): ReportEntry[] | null {
    const result: ReportEntry[] = [];
    for (const entry of entries) {
      if (!entry.title.trim()) { toast("error", "Every entry needs a content title"); return null; }
      const fields = PLATFORM_METRICS[entry.platform] ?? [];
      const numericMetrics: Record<string, number> = {};
      for (const field of fields) {
        const val = parseFloat(entry.metrics[field.key] ?? "0");
        if (isNaN(val)) { toast("error", `Invalid ${field.label} for "${entry.title}"`); return null; }
        numericMetrics[field.key] = val;
      }
      result.push({
        title: entry.title.trim(),
        platform: entry.platform,
        content_type: entry.content_type,
        post_url: entry.post_url.trim(),
        post_date: entry.post_date,
        metrics: numericMetrics,
      });
    }
    return result;
  }

  async function handleSave() {
    if (!reportTitle.trim()) { toast("error", "Report title is required"); return; }
    if (!periodStart || !periodEnd) { toast("error", "Period dates are required"); return; }
    const builtEntries = buildEntries();
    if (!builtEntries) return;

    setSaving(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: selectedClientId,
          report_title: reportTitle.trim(),
          period_start: periodStart,
          period_end: periodEnd,
          entries: builtEntries,
        }),
      });
      if (!res.ok) { const e = await res.json(); toast("error", e.error ?? "Save failed"); return; }
      const { report } = await res.json();
      const newReport: ReportRow = {
        ...report,
        client: selectedClient ? { name: selectedClient.name, email: selectedClient.email, company: selectedClient.company } : { name: "", email: "", company: null },
      };
      setReports((prev) => [newReport, ...prev]);
      setSelectedReportId(report.id);
      toast("success", "Report saved");
    } catch { toast("error", "Something went wrong"); } finally { setSaving(false); }
  }

  async function handleGenerate() {
    if (!reportTitle.trim()) { toast("error", "Report title is required"); return; }
    if (!periodStart || !periodEnd) { toast("error", "Period dates are required"); return; }
    const builtEntries = buildEntries();
    if (!builtEntries) return;

    setSaving(true);
    try {
      let reportId = selectedReportId;
      if (!reportId || !viewingReport) {
        const saveRes = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: selectedClientId,
            report_title: reportTitle.trim(),
            period_start: periodStart,
            period_end: periodEnd,
            entries: builtEntries,
          }),
        });
        if (!saveRes.ok) { const e = await saveRes.json(); toast("error", e.error ?? "Save failed"); return; }
        const { report } = await saveRes.json();
        reportId = report.id as string;
        const newReport: ReportRow = {
          ...report,
          client: selectedClient ? { name: selectedClient.name, email: selectedClient.email, company: selectedClient.company } : { name: "", email: "", company: null },
        };
        setReports((prev) => [newReport, ...prev]);
        setSelectedReportId(reportId);
      }

      setSaving(false);
      setGenerating(true);

      const genRes = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId }),
      });
      if (!genRes.ok) { const e = await genRes.json(); toast("error", e.error ?? "Generation failed"); return; }
      const { overview, comparison, recommendations } = await genRes.json();
      setGeneratedOutput({ id: reportId!, overview, comparison, recommendations });

      const fullSummary = comparison ? `${overview}\n\n---COMPARISON---\n${comparison}` : overview;
      setReports((prev) =>
        prev.map((r) => r.id === reportId ? { ...r, generated_summary: fullSummary, recommendations } : r)
      );
      toast("success", "Report generated");
    } catch { toast("error", "Something went wrong"); } finally { setSaving(false); setGenerating(false); }
  }

  function handleSendEmailClick(reportId: string) {
    const report = reports.find((r) => r.id === reportId);
    if (!report) return;
    setEmailPreview({
      reportId,
      email: report.client.email,
      title: report.report_title,
      period: fmtDateRange(report.period_start, report.period_end),
      entryCount: report.entries.length,
    });
  }

  async function handleConfirmSend() {
    if (!emailPreview) return;
    const { reportId } = emailPreview;
    setEmailPreview(null);
    setSending(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) { const e = await res.json(); toast("error", e.error ?? "Failed to send"); return; }
      toast("success", "Report emailed to client");
      setReports((prev) =>
        prev.map((r) => r.id === reportId ? { ...r, sent_at: new Date().toISOString() } : r)
      );
    } catch { toast("error", "Failed to send email"); } finally { setSending(false); }
  }

  async function handleBulkSend() {
    if (selectedIds.size === 0) return;
    setBulkSending(true);
    try {
      const res = await fetch("/api/reports/send-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_ids: Array.from(selectedIds) }),
      });
      if (!res.ok) { toast("error", "Bulk send failed"); return; }
      const { sent, failed } = await res.json();
      toast("success", `Sent ${sent} report${sent !== 1 ? "s" : ""}${failed > 0 ? `, ${failed} failed` : ""}`);
      const now = new Date().toISOString();
      setReports((prev) =>
        prev.map((r) => selectedIds.has(r.id) ? { ...r, sent_at: r.sent_at ?? now } : r)
      );
      setSelectedIds(new Set());
    } catch { toast("error", "Bulk send failed"); } finally { setBulkSending(false); }
  }



  const isViewingGenerated = viewingReport?.generated_summary && generatedOutput;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-0 min-h-[calc(100vh-65px)]">
      <div className="border-r border-[var(--border)] bg-[var(--card)]/50 flex flex-col">
        <div className="p-4 border-b border-[var(--border)]">
          <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2">Client</p>
          <div className="relative">
            <select
              value={selectedClientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="w-full appearance-none px-3 py-2.5 pr-8 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent cursor-pointer"
            >
              <option value="">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.company ? ` — ${c.company}` : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
          </div>
        </div>

        {!isAllClients && (
          <div className="p-4 border-b border-[var(--border)]">
            <button
              onClick={handleNewReport}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors",
                !selectedReportId
                  ? "bg-[var(--accent-primary)] text-white"
                  : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
              )}
            >
              <BarChart3 size={13} />
              New Report
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            {aggregateStats && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2.5 text-center">
                  <p className="text-lg font-semibold text-[var(--text)]">{aggregateStats.totalReports}</p>
                  <p className="text-[10px] text-[var(--muted)] opacity-60">Reports</p>
                </div>
                <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2.5 text-center">
                  <p className="text-lg font-semibold text-[var(--text)]">{aggregateStats.totalEntries}</p>
                  <p className="text-[10px] text-[var(--muted)] opacity-60">Entries</p>
                </div>
                <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2.5 text-center">
                  <p className="text-lg font-semibold text-[var(--accent-success, #22c55e)]">{aggregateStats.sentCount}</p>
                  <p className="text-[10px] text-[var(--muted)] opacity-60">Sent</p>
                </div>
                <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2.5 text-center">
                  <p className="text-lg font-semibold text-amber-400">{aggregateStats.draftCount}</p>
                  <p className="text-[10px] text-[var(--muted)] opacity-60">Draft</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">
                History ({clientReports.length})
              </p>
              {selectedIds.size > 0 && (
                <button
                  onClick={handleBulkSend}
                  disabled={bulkSending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 transition-colors disabled:opacity-40"
                >
                  {bulkSending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                  Send Selected ({selectedIds.size})
                </button>
              )}
            </div>
            {clientReports.length === 0 ? (
              <p className="text-xs text-[var(--muted)] opacity-60">No reports yet.</p>
            ) : (
              <div className="space-y-2">
                {clientReports.map((report) => {
                  const platforms = [...new Set(report.entries.map((e) => e.platform))];
                  const canBulkSelect = !report.sent_at && !!report.generated_summary;
                  return (
                    <div key={report.id} className="flex items-start gap-2">
                      {canBulkSelect && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(report.id)}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(report.id);
                              else next.delete(report.id);
                              return next;
                            });
                          }}
                          className="mt-3.5 shrink-0 accent-[var(--accent-primary)] cursor-pointer"
                        />
                      )}
                      <button
                        onClick={() => handleViewReport(report)}
                        className={cn(
                          "flex-1 text-left p-3 rounded-lg border transition-colors",
                          selectedReportId === report.id
                            ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/5"
                            : "border-[var(--border)] hover:border-[var(--accent-primary)]/30 hover:bg-[var(--surface-elevated)]"
                        )}
                      >
                        <p className="text-xs font-medium text-[var(--text)] truncate">{report.report_title}</p>
                        <p className="text-[10px] text-[var(--muted)] opacity-60 mt-0.5">
                          {fmtDateRange(report.period_start, report.period_end)}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {platforms.map((p) => (
                            <span key={p} className={cn("text-[10px] font-medium", PLATFORM_COLORS[p] ?? "text-[var(--muted)]")}>
                              {p}
                            </span>
                          ))}
                          <span className="text-[10px] text-[var(--muted)] opacity-40">
                            {report.entries.length} piece{report.entries.length !== 1 ? "s" : ""}
                          </span>
                          {isAllClients && (
                            <span className="text-[10px] text-[var(--muted)] opacity-50">
                              {report.client.name}
                            </span>
                          )}
                          <span className="ml-auto shrink-0">
                            {report.sent_at ? (
                              <span className="flex items-center gap-1 text-[10px] text-[var(--accent-success)]">
                                <CheckCircle2 size={10} /> Sent
                              </span>
                            ) : report.generated_summary ? (
                              <span className="text-[10px] text-amber-400">Draft</span>
                            ) : (
                              <span className="text-[10px] text-[var(--muted)] opacity-40">Saved</span>
                            )}
                          </span>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col overflow-y-auto">
        <AnimatePresence mode="wait">
          {isViewingGenerated && generatedOutput && viewingReport ? (

            <motion.div
              key={`view-${generatedOutput.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-6 space-y-6"
            >
              <div>
                <button onClick={handleNewReport} className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors mb-3">
                  <ArrowLeft size={12} /> New report
                </button>
                <h2 className="text-lg font-semibold text-[var(--text)]">{viewingReport.report_title}</h2>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
                    <Calendar size={11} />
                    {fmtDateRange(viewingReport.period_start, viewingReport.period_end)}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {viewingReport.entries.length} piece{viewingReport.entries.length !== 1 ? "s" : ""} for {viewingReport.client.name}
                  </span>
                </div>
              </div>

              {viewingReport.aggregate_metrics?.overall && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-3">Overall Performance</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {Object.entries(viewingReport.aggregate_metrics.overall)
                      .filter(([k]) => k !== "entry_count")
                      .map(([key, value]) => {
                        const IconComp = METRIC_ICON_MAP[key] ?? BarChart3;
                        const prev = viewingReport.previous_aggregate?.overall?.[key];
                        const change = prev !== undefined ? calcChange(value, prev) : null;
                        return (
                          <div key={key} className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <IconComp size={13} className="text-[var(--muted)]" />
                              <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] opacity-60">{fmtLabel(key)}</span>
                            </div>
                            <p className="text-xl font-semibold text-[var(--text)]">{fmtMetricVal(key, value)}</p>
                            {change && change.direction !== "flat" && (
                              <div className={cn("flex items-center gap-1 mt-1.5 text-[11px] font-medium", change.direction === "up" ? "text-emerald-400" : "text-red-400")}>
                                {change.direction === "up" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                {change.direction === "up" ? "+" : ""}{change.pct}% vs last period
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-3">Content Breakdown</p>
                <div className="space-y-2">
                  {viewingReport.entries.map((entry, i) => {
                    const topMetrics = Object.entries(entry.metrics).slice(0, 4);
                    return (
                      <div key={i} className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-[var(--text)] truncate">{entry.title}</p>
                              {entry.post_url && (
                                <a href={entry.post_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[var(--accent-primary)] hover:opacity-80">
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={cn("text-[10px] font-medium", PLATFORM_COLORS[entry.platform] ?? "text-[var(--muted)]")}>{entry.platform}</span>
                              <span className="text-[10px] text-[var(--muted)] opacity-50">{entry.content_type}</span>
                              {entry.post_date && <span className="text-[10px] text-[var(--muted)] opacity-40">{new Date(entry.post_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-3 flex-wrap">
                          {topMetrics.map(([k, v]) => (
                            <div key={k} className="flex items-center gap-1.5">
                              <span className="text-[10px] text-[var(--muted)] opacity-60">{fmtLabel(k)}</span>
                              <span className="text-xs font-semibold text-[var(--text)]">{fmtMetricVal(k, v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-5">
                <p className="text-[10px] uppercase tracking-widest text-[var(--accent-primary)] mb-3 font-semibold">Performance Overview</p>
                <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">{generatedOutput.overview}</p>
              </div>

              {generatedOutput.comparison && (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-5">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--accent-primary)] mb-3 font-semibold">Period Comparison</p>
                  <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">{generatedOutput.comparison}</p>
                </div>
              )}

              {generatedOutput.recommendations && (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-5">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--accent-primary)] mb-3 font-semibold">Recommendations</p>
                  <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">{generatedOutput.recommendations}</p>
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap pb-6">
                <button
                  onClick={() => handleSendEmailClick(generatedOutput.id)}
                  disabled={sending || !!viewingReport.sent_at}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                    viewingReport.sent_at
                      ? "bg-[var(--surface-elevated)] text-[var(--muted)] border border-[var(--border)]"
                      : "bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90"
                  )}
                >
                  {sending ? <Loader2 size={12} className="animate-spin" /> : viewingReport.sent_at ? <CheckCircle2 size={12} /> : <Send size={12} />}
                  {viewingReport.sent_at ? "Sent to Client" : "Email to Client"}
                </button>
                {viewingReport.sent_at && (
                  <span className="text-[10px] text-[var(--muted)] opacity-50">Sent {formatTimeAgo(viewingReport.sent_at)}</span>
                )}
              </div>
            </motion.div>
          ) : (

            <motion.div
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-6 space-y-6"
            >
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  New Report
                  {selectedClient && <span className="text-[var(--muted)] font-normal text-sm ml-2">for {selectedClient.name}</span>}
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2 block">Report Title</label>
                  <input
                    type="text"
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    placeholder="e.g. Weekly Report — March W1"
                    className="w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2 block">Period Start</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2 block">Period End</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">
                    Content Entries ({entries.length})
                  </label>
                  <button
                    onClick={addEntry}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)] transition-colors"
                  >
                    <Plus size={11} />
                    Add Entry
                  </button>
                </div>

                <div className="space-y-3">
                  {entries.map((entry, idx) => {
                    const metricFields = PLATFORM_METRICS[entry.platform] ?? [];
                    return (
                      <div
                        key={entry.id}
                        className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden"
                      >
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
                          <button onClick={() => toggleEntryCollapse(entry.id)} className="text-[var(--muted)] hover:text-[var(--text)]">
                            {entry.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                          </button>
                          <span className={cn("text-[10px] font-semibold", PLATFORM_COLORS[entry.platform] ?? "text-[var(--muted)]")}>
                            {entry.platform}
                          </span>
                          <span className="text-xs text-[var(--text)] truncate flex-1">
                            {entry.title || `Entry ${idx + 1}`}
                          </span>
                          {entries.length > 1 && (
                            <button onClick={() => removeEntry(entry.id)} className="text-[var(--muted)] hover:text-red-400 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>

                        <AnimatePresence>
                          {!entry.collapsed && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-4 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  <div>
                                    <label className="text-[10px] text-[var(--muted)] opacity-60 mb-1 block">Title</label>
                                    <input
                                      type="text"
                                      value={entry.title}
                                      onChange={(e) => updateEntry(entry.id, { title: e.target.value })}
                                      placeholder="Content title"
                                      className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-[var(--muted)] opacity-60 mb-1 block">Post URL</label>
                                    <div className="relative">
                                      <Link2 size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] opacity-40" />
                                      <input
                                        type="url"
                                        value={entry.post_url}
                                        onChange={(e) => updateEntry(entry.id, { post_url: e.target.value })}
                                        placeholder="https://..."
                                        className="w-full pl-8 pr-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-[var(--muted)] opacity-60 mb-1 block">Post Date</label>
                                    <input
                                      type="date"
                                      value={entry.post_date}
                                      onChange={(e) => updateEntry(entry.id, { post_date: e.target.value })}
                                      className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent cursor-pointer"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] text-[var(--muted)] opacity-60 mb-1 block">Platform</label>
                                    <div className="relative">
                                      <select
                                        value={entry.platform}
                                        onChange={(e) => updateEntry(entry.id, { platform: e.target.value as ReportPlatform })}
                                        className="w-full appearance-none px-3 py-2 pr-8 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent cursor-pointer"
                                      >
                                        {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                                      </select>
                                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-[var(--muted)] opacity-60 mb-1 block">Type</label>
                                    <div className="relative">
                                      <select
                                        value={entry.content_type}
                                        onChange={(e) => updateEntry(entry.id, { content_type: e.target.value as ReportContentType })}
                                        className="w-full appearance-none px-3 py-2 pr-8 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent cursor-pointer"
                                      >
                                        {CONTENT_TYPES.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
                                      </select>
                                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                  {metricFields.map((field) => (
                                    <div key={field.key}>
                                      <div className="flex items-center gap-1 mb-1">
                                        <field.icon size={10} className="text-[var(--muted)] opacity-50" />
                                        <label className="text-[10px] text-[var(--muted)] opacity-60">{field.label}</label>
                                      </div>
                                      <input
                                        type="number"
                                        step={field.key.includes("rate") || field.key === "ctr" ? "0.01" : "1"}
                                        value={entry.metrics[field.key] ?? ""}
                                        onChange={(e) => updateEntryMetric(entry.id, field.key, e.target.value)}
                                        placeholder="0"
                                        className="w-full px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={addEntry}
                  className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent-primary)]/30 transition-colors"
                >
                  <Plus size={13} />
                  Add another content entry
                </button>
              </div>

              <div className="flex items-center gap-3 pt-2 pb-6">
                <button
                  onClick={handleGenerate}
                  disabled={saving || generating || !reportTitle.trim() || !periodStart || !periodEnd}
                  className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <><Loader2 size={14} className="animate-spin" /> Saving...</>
                  ) : generating ? (
                    <><Loader2 size={14} className="animate-spin" /> Generating...</>
                  ) : (
                    <><Play size={14} /> Generate Report</>
                  )}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || generating || !reportTitle.trim() || !periodStart || !periodEnd}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save size={13} />
                  Save Only
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {emailPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setEmailPreview(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 w-full max-w-md mx-4 shadow-2xl"
            >
              <p className="text-[10px] uppercase tracking-widest text-[var(--accent-primary)] font-semibold mb-4">Confirm Send</p>
              <p className="text-sm text-[var(--text)] leading-relaxed mb-4">
                You&apos;re about to send <span className="font-semibold">{emailPreview.title}</span> to{" "}
                <span className="font-semibold text-[var(--accent-primary)]">{emailPreview.email}</span>. Proceed?
              </p>
              <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 mb-5 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--muted)]">Period</span>
                  <span className="text-[var(--text)]">{emailPreview.period}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--muted)]">Entries</span>
                  <span className="text-[var(--text)]">{emailPreview.entryCount}</span>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setEmailPreview(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSend}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 transition-colors"
                >
                  <Send size={12} />
                  Confirm Send
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
