"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Users, Clock, ChevronDown, ChevronUp, Filter,
  Loader2, UserPlus, ExternalLink, Sparkles, Calendar,
  Globe, Video, X, Archive, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastProvider";
import type { ParsedBrief } from "@/lib/briefs/parseBrief";

export interface BriefItem {
  id: string;
  client_id: string;
  raw_input: string;
  content_type: string;
  platform: string | null;
  topic: string | null;
  target_audience: string | null;
  tone: string | null;
  deadline: string | null;
  status: string;
  assigned_writer: string | null;
  parsed_brief: ParsedBrief | null;
  parsed_at: string | null;
  assigned_at: string | null;
  script_id: string | null;
  created_at: string;
  updated_at: string;
  client: {
    id: string;
    name: string;
    company: string | null;
    email: string;
  };
}

interface BriefListProps {
  briefs: BriefItem[];
  onRefresh: () => void;
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "intake", label: "Intake" },
  { value: "parsing", label: "Parsing" },
  { value: "parsed", label: "Parsed" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "script_uploaded", label: "Done" },
  { value: "archived", label: "Archived" },
] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  intake: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  parsing: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  parsed: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
  assigned: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
  in_progress: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" },
  script_uploaded: { bg: "bg-[var(--accent-success)]/10", text: "text-[var(--accent-success)]", border: "border-[var(--accent-success)]/20" },
  archived: { bg: "bg-[var(--muted)]/10", text: "text-[var(--muted)]", border: "border-[var(--muted)]/20" },
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  video_script: "Video Script",
  social_post: "Social Post",
  blog: "Blog",
  reel: "Reel",
  story: "Story",
};

export default function BriefList({ briefs, onRefresh }: BriefListProps) {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [writerInput, setWriterInput] = useState("");
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [creatingScriptId, setCreatingScriptId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return briefs;
    return briefs.filter((b) => b.status === statusFilter);
  }, [briefs, statusFilter]);

  const handleParse = useCallback(async (id: string) => {
    setParsingId(id);
    try {
      const res = await fetch(`/api/briefs/${id}/parse`, { method: "POST" });
      if (res.ok) {
        toast("success", "Brief parsed successfully");
        onRefresh();
      } else {
        const e = await res.json();
        toast("error", e.error ?? "Parsing failed");
      }
    } catch {
      toast("error", "Failed to parse brief");
    } finally {
      setParsingId(null);
    }
  }, [toast, onRefresh]);

  const handleAssign = useCallback(async (id: string) => {
    if (!writerInput.trim()) {
      toast("error", "Enter a writer name");
      return;
    }
    try {
      const res = await fetch(`/api/briefs/${id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_writer: writerInput.trim() }),
      });
      if (res.ok) {
        toast("success", `Assigned to ${writerInput.trim()}`);
        setAssigningId(null);
        setWriterInput("");
        onRefresh();
      } else {
        const e = await res.json();
        toast("error", e.error ?? "Assignment failed");
      }
    } catch {
      toast("error", "Failed to assign writer");
    }
  }, [writerInput, toast, onRefresh]);

  const handleArchive = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/briefs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (res.ok) {
        toast("success", "Brief archived");
        onRefresh();
      } else {
        toast("error", "Failed to archive");
      }
    } catch {
      toast("error", "Failed to archive");
    }
  }, [toast, onRefresh]);

  const handleCreateScript = useCallback(async (brief: BriefItem) => {
    setCreatingScriptId(brief.id);
    try {
      const res = await fetch(`/api/briefs/${brief.id}/create-script`, {
        method: "POST",
      });
      if (res.ok) {
        toast("success", "Script created from brief");
        onRefresh();
      } else {
        const e = await res.json();
        toast("error", e.error ?? "Failed to create script");
      }
    } catch {
      toast("error", "Failed to create script");
    } finally {
      setCreatingScriptId(null);
    }
  }, [toast, onRefresh]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <Filter size={12} className="text-[var(--muted)] shrink-0" />
        {STATUS_FILTERS.map((sf) => {
          const count = sf.value === "all" ? briefs.length : briefs.filter((b) => b.status === sf.value).length;
          return (
            <button
              key={sf.value}
              onClick={() => setStatusFilter(sf.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap",
                statusFilter === sf.value
                  ? "bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 text-[var(--accent-primary)]"
                  : "bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              {sf.label} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <FileText size={24} className="text-[var(--muted)] opacity-30 mb-3" />
          <p className="text-sm text-[var(--muted)] opacity-60">No briefs found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((brief) => {
            const isExpanded = expandedId === brief.id;
            const colors = STATUS_COLORS[brief.status] ?? STATUS_COLORS.intake;
            const parsed = brief.parsed_brief;

            return (
              <motion.div
                key={brief.id}
                layout
                className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : brief.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-[var(--surface-elevated)]/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="shrink-0">
                      <Video size={14} className="text-[var(--muted)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-medium text-[var(--text)] truncate">
                          {parsed?.title ?? brief.topic ?? "Untitled Brief"}
                        </h3>
                        <span className={cn("shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border", colors.bg, colors.text, colors.border)}>
                          {brief.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                        <span className="flex items-center gap-1">
                          <Users size={10} />
                          {brief.client.name}
                        </span>
                        {brief.client.company && (
                          <span className="opacity-60">/ {brief.client.company}</span>
                        )}
                        <span className="opacity-30">&middot;</span>
                        <span>{CONTENT_TYPE_LABELS[brief.content_type] ?? brief.content_type}</span>
                        {brief.platform && (
                          <>
                            <span className="opacity-30">&middot;</span>
                            <span className="flex items-center gap-1">
                              <Globe size={10} />
                              {brief.platform}
                            </span>
                          </>
                        )}
                        {brief.deadline && (
                          <>
                            <span className="opacity-30">&middot;</span>
                            <span className="flex items-center gap-1">
                              <Calendar size={10} />
                              {new Date(brief.deadline).toLocaleDateString()}
                            </span>
                          </>
                        )}
                        {brief.assigned_writer && (
                          <>
                            <span className="opacity-30">&middot;</span>
                            <span className="flex items-center gap-1">
                              <UserPlus size={10} />
                              {brief.assigned_writer}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 ml-2">
                    {isExpanded ? (
                      <ChevronUp size={14} className="text-[var(--muted)]" />
                    ) : (
                      <ChevronDown size={14} className="text-[var(--muted)]" />
                    )}
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 border-t border-[var(--border)]">
                        <div className="flex items-center gap-2 py-3">
                          {(brief.status === "intake" || brief.status === "parsing") && (
                            <button
                              onClick={() => handleParse(brief.id)}
                              disabled={parsingId === brief.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/20 disabled:opacity-40 transition-colors"
                            >
                              {parsingId === brief.id ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                              {parsingId === brief.id ? "Parsing..." : "Parse with AI"}
                            </button>
                          )}
                          {brief.status === "parsed" && assigningId !== brief.id && (
                            <button
                              onClick={() => setAssigningId(brief.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                            >
                              <UserPlus size={11} />
                              Assign Writer
                            </button>
                          )}
                          {assigningId === brief.id && (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={writerInput}
                                onChange={(e) => setWriterInput(e.target.value)}
                                placeholder="Writer name..."
                                className="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-xs text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent w-40"
                                autoFocus
                                onKeyDown={(e) => e.key === "Enter" && handleAssign(brief.id)}
                              />
                              <button
                                onClick={() => handleAssign(brief.id)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 transition-colors"
                              >
                                Assign
                              </button>
                              <button
                                onClick={() => { setAssigningId(null); setWriterInput(""); }}
                                className="text-[var(--muted)] hover:text-[var(--text)]"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          )}
                          {(brief.status === "assigned" || brief.status === "in_progress") && !brief.script_id && (
                            <button
                              onClick={() => handleCreateScript(brief)}
                              disabled={creatingScriptId === brief.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/20 disabled:opacity-40 transition-colors"
                            >
                              {creatingScriptId === brief.id ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                              {creatingScriptId === brief.id ? "Creating..." : "Create Script from Brief"}
                            </button>
                          )}
                          {brief.script_id && (
                            <a
                              href={`/dashboard`}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)] transition-colors"
                            >
                              <ExternalLink size={11} />
                              View Script
                            </a>
                          )}
                          {brief.status !== "archived" && (
                            <button
                              onClick={() => handleArchive(brief.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)] transition-colors ml-auto"
                            >
                              <Archive size={11} />
                              Archive
                            </button>
                          )}
                        </div>

                        {parsed ? (
                          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
                            <DetailRow label="Hook Angle" value={parsed.hook_angle} />
                            <DetailRow label="Core Message" value={parsed.core_message} />
                            <DetailRow label="CTA" value={parsed.cta} />
                            <DetailRow label="Tone Direction" value={parsed.tone_direction} />
                            <DetailRow label="Audience" value={parsed.target_audience_profile} />
                            <DetailRow label="Brand Notes" value={parsed.brand_alignment_notes} />
                            {parsed.key_talking_points?.length > 0 && (
                              <div className="px-4 py-3">
                                <span className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">Key Talking Points</span>
                                <ul className="mt-1.5 space-y-1">
                                  {parsed.key_talking_points.map((point, i) => (
                                    <li key={i} className="text-xs text-[var(--text)] flex items-start gap-2">
                                      <span className="text-[var(--accent-primary)] shrink-0">{i + 1}.</span>
                                      {point}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {parsed.writer_notes && <DetailRow label="Writer Notes" value={parsed.writer_notes} />}
                            <div className="px-4 py-3">
                              <span className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">Platform Constraints</span>
                              <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text)]">
                                <span>{parsed.platform_constraints?.format}</span>
                                {parsed.platform_constraints?.max_duration && (
                                  <>
                                    <span className="text-[var(--muted)] opacity-30">&middot;</span>
                                    <span>{parsed.platform_constraints.max_duration}</span>
                                  </>
                                )}
                                {parsed.platform_constraints?.aspect_ratio && (
                                  <>
                                    <span className="text-[var(--muted)] opacity-30">&middot;</span>
                                    <span>{parsed.platform_constraints.aspect_ratio}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4">
                            <span className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">Raw Input</span>
                            <p className="text-xs text-[var(--text)] mt-1 leading-relaxed whitespace-pre-wrap">
                              {brief.raw_input.length > 500 ? brief.raw_input.slice(0, 500) + "..." : brief.raw_input}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center gap-4 mt-3 text-[10px] text-[var(--muted)] opacity-60">
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            Created {new Date(brief.created_at).toLocaleString()}
                          </span>
                          {brief.parsed_at && (
                            <span>Parsed {new Date(brief.parsed_at).toLocaleString()}</span>
                          )}
                          {brief.assigned_at && (
                            <span>Assigned {new Date(brief.assigned_at).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="px-4 py-3">
      <span className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">{label}</span>
      <p className="text-xs text-[var(--text)] mt-1 leading-relaxed">{value}</p>
    </div>
  );
}
