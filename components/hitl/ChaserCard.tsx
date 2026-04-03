"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Check, X, Loader2, User, RotateCcw,
  ChevronDown, ChevronUp, Mail, Phone, Send, Save,
  AlertTriangle, MessageSquare, Zap,
} from "lucide-react";
import Link from "next/link";
import { cn, formatTimeAgo } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastProvider";
import type { ChaserData } from "@/app/hitl/page";

interface ChaserCardProps {
  chaser: ChaserData;
  memories: { content: string; memory_type: string; created_at: string }[];
  onActionComplete: () => void;
  onSelectNext?: () => void;
  onSelectPrev?: () => void;
}

const CHASER_SCORE_LABELS: Record<string, string> = {
  professionalism: "Professionalism",
  personalization: "Personalisation",
  clarity: "Clarity",
  persuasiveness: "Persuasiveness",
};

const SCRIPT_SCORE_LABELS: Record<string, string> = {
  hook_strength: "Hook Strength",
  cta_clarity: "CTA Clarity",
  brand_alignment: "Brand Alignment",
  platform_fit: "Platform Fit",
  pacing_structure: "Pacing & Structure",
  tone_consistency: "Tone Consistency",
};

const TONE_OPTIONS = ["gentle", "neutral", "firm", "urgent"] as const;
type Tone = (typeof TONE_OPTIONS)[number];

const QUICK_CHIPS = [
  "Too long — make it shorter",
  "More urgent",
  "Add the deadline date",
  "More personal",
  "Change tone to firm",
] as const;

function scoreLabel(val: number): string {
  if (val >= 8) return "Strong";
  if (val >= 6) return "Solid";
  if (val >= 4) return "Fair";
  return "Weak";
}

function scoreBarColor(val: number): string {
  if (val >= 8) return "bg-emerald-400";
  if (val >= 6) return "bg-sky-400";
  if (val >= 4) return "bg-amber-400";
  return "bg-red-400";
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, (value / 10) * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-[var(--muted)] w-[120px] shrink-0 truncate">{label}</span>
      <div className="flex-1 h-[6px] rounded-full bg-[var(--surface-elevated)] overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", scoreBarColor(value))} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-[var(--muted)] w-[44px] text-right shrink-0">{scoreLabel(value)}</span>
    </div>
  );
}

export default function ChaserCard({ chaser, memories, onActionComplete, onSelectNext, onSelectPrev }: ChaserCardProps) {
  const { id, script_id: scriptId, client, script, hitl_state: hitlState } = chaser;
  const [editedContent, setEditedContent] = useState(chaser.draft_content);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [result, setResult] = useState<{ action: string; success: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [scoresExpanded, setScoresExpanded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const [undoTimer, setUndoTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [pendingApprove, setPendingApprove] = useState(false);

  const [instruction, setInstruction] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [previousDraft, setPreviousDraft] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState<string | null>(null);
  const [newSubject, setNewSubject] = useState<string | null>(null);

  const initialTone = (hitlState?.tone_recommendation as Tone) ?? "neutral";
  const [selectedTone, setSelectedTone] = useState<Tone>(initialTone);

  const [selectedChannel, setSelectedChannel] = useState<"email" | "whatsapp" | "both">(
    (client.preferred_channel === "whatsapp" || client.preferred_channel === "both")
      ? client.preferred_channel as "email" | "whatsapp" | "both"
      : "email"
  );

  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [showHints, setShowHints] = useState(true);

  const isSaved = chaser.status === "draft_saved";
  const hasEdits = editedContent !== chaser.draft_content;
  const scores = hitlState?.critique_scores;
  const daysSinceSent = script.sent_at
    ? Math.round((Date.now() - new Date(script.sent_at).getTime()) / 86400000)
    : null;

  const comparing = previousDraft !== null && newDraft !== null;

  useEffect(() => {
    return () => {
      if (undoTimer) clearTimeout(undoTimer);
    };
  }, [undoTimer]);

  const debouncedSave = useCallback(
    (content: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await fetch(`/api/hitl/${id}/draft`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ draft_content: content }),
          });
        } catch {
          // silent
        } finally {
          setSaving(false);
        }
      }, 500);
    },
    [id]
  );

  function handleEditChange(value: string) {
    setEditedContent(value);
    debouncedSave(value);
  }

  async function handleRegenerate(instructionText?: string) {
    const text = instructionText ?? instruction;
    if (!text && selectedTone === initialTone) return;

    setRegenerating(true);
    setPreviousDraft(editedContent);
    setNewDraft(null);

    try {
      const res = await fetch(`/api/hitl/${id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: text || undefined,
          tone: selectedTone !== initialTone ? selectedTone : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast("error", data.error ?? "Regeneration failed");
        setPreviousDraft(null);
        return;
      }

      const data = await res.json();
      setNewDraft(data.draft_content);
      if (data.email_subject) setNewSubject(data.email_subject);
      setInstruction("");
    } catch {
      toast("error", "Failed to regenerate");
      setPreviousDraft(null);
    } finally {
      setRegenerating(false);
    }
  }

  function pickDraft(version: "old" | "new") {
    if (version === "new" && newDraft) {
      setEditedContent(newDraft);
      debouncedSave(newDraft);
      toast("success", "New draft selected");
    } else {
      toast("info", "Kept original draft");
    }
    setPreviousDraft(null);
    setNewDraft(null);
    setNewSubject(null);
  }

  async function handleApprove() {
    setPendingApprove(true);
    toast("info", "Sending in 3 seconds — click undo to cancel");

    const timer = setTimeout(async () => {
      setPendingApprove(false);
      setLoadingAction("approve");
      try {
        const res = await fetch(`/api/hitl/${id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            editedContent: hasEdits ? editedContent : undefined,
            channel: selectedChannel,
          }),
        });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setResult({ action: hasEdits ? "edited" : "approved", success: true });
        if (data.warning) {
          toast("info", data.warning);
        } else {
          toast("success", hasEdits ? "Edited draft sent" : "Draft approved and sent");
        }
        onActionComplete();
      } catch {
        toast("error", "Failed to approve draft");
      } finally {
        setLoadingAction(null);
      }
    }, 3000);

    setUndoTimer(timer);
  }

  function handleUndoApprove() {
    if (undoTimer) {
      clearTimeout(undoTimer);
      setUndoTimer(null);
    }
    setPendingApprove(false);
    toast("info", "Send cancelled");
  }

  async function handleSaveDraft() {
    setLoadingAction("save");
    try {
      const res = await fetch(`/api/hitl/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editedContent: hasEdits ? editedContent : undefined, saveOnly: true }),
      });
      if (!res.ok) throw new Error("Failed");
      toast("success", "Draft saved for later");
    } catch {
      toast("error", "Failed to save draft");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleReject() {
    setLoadingAction("reject");
    try {
      const res = await fetch(`/api/hitl/${id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!res.ok) throw new Error("Failed");
      setResult({ action: "rejected", success: true });
      toast("success", "Draft rejected");
    } catch {
      toast("error", "Failed to reject draft");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleLegacyRegenerate() {
    setLoadingAction("regenerate");
    try {
      await fetch(`/api/hitl/${id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const res = await fetch(`/api/agent/trigger/${scriptId}`, { method: "POST" });
      if (res.status === 409) {
        toast("info", "Draft already exists in HITL panel");
        return;
      }
      if (!res.ok) throw new Error("Failed");
      toast("info", "Re-generating draft...");
      onActionComplete();
    } catch {
      toast("error", "Failed to re-generate draft");
    } finally {
      setLoadingAction(null);
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case "a":
          e.preventDefault();
          if (!loadingAction && !comparing && !pendingApprove) {
            handleApprove();
          }
          break;
        case "e":
          e.preventDefault();
          editTextareaRef.current?.focus();
          break;
        case "r":
          e.preventDefault();
          if (!loadingAction && !comparing && !pendingApprove) {
            handleReject();
          }
          break;
        case "n":
          e.preventDefault();
          onSelectNext?.();
          break;
        case "p":
          e.preventDefault();
          onSelectPrev?.();
          break;
        default:
          return;
      }

      setShowHints(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingAction, comparing, pendingApprove, onSelectNext, onSelectPrev]);

  if (result?.success) {
    return (
      <motion.div initial={{ opacity: 1 }} animate={{ opacity: 0.6 }} className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-[13px] text-[var(--muted)] mb-3">
            {result.action === "approved" && "Approved and sent"}
            {result.action === "edited" && "Edited and sent"}
            {result.action === "rejected" && "Draft rejected"}
          </p>
          {result.action === "rejected" && (
            <button
              onClick={handleLegacyRegenerate}
              disabled={loadingAction === "regenerate"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)] disabled:opacity-40 mx-auto"
            >
              {loadingAction === "regenerate" ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Re-generate Draft
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  const chaserLabel = chaser.chaser_count > 0 ? `Chaser #${chaser.chaser_count + 1}` : "First chaser";
  const approvalRate = client.total_scripts > 0
    ? Math.round((client.approved_count / client.total_scripts) * 100)
    : null;

  const allScoreEntries: { label: string; value: number; group: string }[] = [];

  if (script.quality_score) {
    for (const [key, label] of Object.entries(SCRIPT_SCORE_LABELS)) {
      const val = (script.quality_score as Record<string, unknown>)?.[key];
      if (val != null && typeof val === "number") {
        allScoreEntries.push({ label, value: val, group: "Script Quality" });
      }
    }
  }

  if (scores) {
    for (const [key, label] of Object.entries(CHASER_SCORE_LABELS)) {
      const val = scores[key as keyof typeof scores];
      if (val != null && typeof val === "number") {
        allScoreEntries.push({ label, value: val, group: "Chaser Quality" });
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {showHints && (
        <div className="px-6 py-1.5 border-b border-[var(--border)] bg-[var(--surface-elevated)]/50">
          <p className="text-[10px] text-[var(--muted)] opacity-50 text-center tracking-wide">
            <kbd className="text-[var(--text)] opacity-60">A</kbd> approve · <kbd className="text-[var(--text)] opacity-60">E</kbd> edit · <kbd className="text-[var(--text)] opacity-60">R</kbd> reject · <kbd className="text-[var(--text)] opacity-60">N</kbd> next · <kbd className="text-[var(--text)] opacity-60">P</kbd> prev
          </p>
        </div>
      )}

      <div className="px-6 py-3 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[13px] font-medium text-[var(--text)]">{script.title}</span>
          {script.platform && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--muted)]">
              {script.platform}
            </span>
          )}
          {isSaved && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--muted)]">
              Saved
            </span>
          )}
          <span className="text-[11px] text-[var(--muted)] opacity-50 ml-auto">
            Generated {formatTimeAgo(chaser.created_at)}
          </span>
        </div>

        <div className="flex items-center gap-4 flex-wrap mt-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={11} className="text-amber-400" />
            <span className="text-[11px] font-medium text-amber-400">{chaserLabel}</span>
          </div>
          {daysSinceSent !== null && (
            <span className="text-[11px] text-[var(--muted)]">
              <span className="text-red-400 font-medium">{daysSinceSent}d</span> since sent
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <User size={10} className="text-[var(--muted)]" />
            <Link href={`/clients/${chaser.client_id}`} className="text-[11px] text-[var(--text)] hover:underline">{client.name}</Link>
            {client.company && <span className="text-[11px] text-[var(--muted)] opacity-60">/ {client.company}</span>}
          </div>
          {approvalRate !== null && (
            <span className="text-[11px] text-[var(--muted)]">
              Approval: <span className={cn("font-medium", approvalRate >= 70 ? "text-emerald-400" : approvalRate >= 40 ? "text-amber-400" : "text-red-400")}>{approvalRate}%</span>
            </span>
          )}
          {hitlState?.urgency_score != null && (
            <span className="text-[11px] text-[var(--muted)]">
              Urgency: <span className={cn("font-medium",
                (hitlState.urgency_score as number) >= 7 ? "text-red-400" :
                (hitlState.urgency_score as number) >= 4 ? "text-amber-400" : "text-emerald-400"
              )}>{hitlState.urgency_score as number}/10</span>
            </span>
          )}
        </div>
      </div>

      {allScoreEntries.length > 0 && (
        <div className="border-b border-[var(--border)]">
          <button
            onClick={() => setScoresExpanded(!scoresExpanded)}
            className="w-full px-6 py-2 flex items-center justify-between hover:bg-[var(--surface-elevated)]/50 transition-colors"
          >
            <span className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">
              Scores
            </span>
            {scoresExpanded ? <ChevronUp size={12} className="text-[var(--muted)]" /> : <ChevronDown size={12} className="text-[var(--muted)]" />}
          </button>
          {scoresExpanded && (
            <div className="px-6 pb-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
                {script.quality_score && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2">Script Quality</p>
                    <div className="space-y-2">
                      {allScoreEntries.filter((e) => e.group === "Script Quality").map((e) => (
                        <ScoreBar key={e.label} label={e.label} value={e.value} />
                      ))}
                      {(script.quality_score as { average?: number })?.average != null && (
                        <div className="flex items-center gap-3 pt-1 border-t border-[var(--border)]">
                          <span className="text-[11px] text-[var(--muted)] w-[120px] shrink-0 font-medium">Average</span>
                          <span className="text-[11px] font-semibold text-[var(--text)]">
                            {((script.quality_score as { average: number }).average).toFixed(1)}/10
                          </span>
                        </div>
                      )}
                    </div>
                    {(script.quality_score as { feedback?: string })?.feedback && (
                      <p className="text-[11px] text-[var(--muted)] opacity-70 italic mt-2">
                        {(script.quality_score as { feedback: string }).feedback}
                      </p>
                    )}
                    {((script.quality_score as { strengths?: string[] })?.strengths ?? []).length > 0 && (
                      <div className="mt-2">
                        <p className="text-[10px] text-emerald-400 font-medium mb-1">Strengths</p>
                        {((script.quality_score as { strengths?: string[] }).strengths ?? []).map((s, i) => (
                          <p key={i} className="text-[11px] text-[var(--text)] opacity-70">+ {s}</p>
                        ))}
                      </div>
                    )}
                    {((script.quality_score as { improvements?: string[] })?.improvements ?? []).length > 0 && (
                      <div className="mt-2">
                        <p className="text-[10px] text-amber-400 font-medium mb-1">To Improve</p>
                        {((script.quality_score as { improvements?: string[] }).improvements ?? []).map((s, i) => (
                          <p key={i} className="text-[11px] text-[var(--text)] opacity-70">- {s}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {scores && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2">Chaser Quality</p>
                    <div className="space-y-2">
                      {allScoreEntries.filter((e) => e.group === "Chaser Quality").map((e) => (
                        <ScoreBar key={e.label} label={e.label} value={e.value} />
                      ))}
                      {scores.average != null && (
                        <div className="flex items-center gap-3 pt-1 border-t border-[var(--border)]">
                          <span className="text-[11px] text-[var(--muted)] w-[120px] shrink-0 font-medium">Average</span>
                          <span className="text-[11px] font-semibold text-[var(--text)]">
                            {scores.average.toFixed(1)}/10
                          </span>
                        </div>
                      )}
                    </div>
                    {hitlState?.critique_feedback && (
                      <p className="text-[11px] text-[var(--muted)] opacity-70 italic mt-2">{hitlState.critique_feedback as string}</p>
                    )}
                    {(hitlState?.revision_count as number) > 0 && (
                      <p className="text-[10px] text-[var(--muted)] opacity-50 mt-1">
                        Revised {hitlState?.revision_count as number} time{(hitlState?.revision_count as number) > 1 ? "s" : ""} by agent
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {script.status && script.status !== "pending_review" && script.status !== "draft" && (
        <div className="px-6 py-3 border-b border-[var(--border)]">
          <div className={cn(
            "border rounded-lg px-4 py-3",
            script.status === "approved" ? "bg-emerald-500/5 border-emerald-500/20" :
            script.status === "rejected" ? "bg-red-500/5 border-red-500/20" :
            script.status === "changes_requested" ? "bg-amber-500/5 border-amber-500/20" :
            "bg-[var(--card)] border-[var(--border)]"
          )}>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                "text-[11px] font-semibold capitalize",
                script.status === "approved" ? "text-emerald-400" :
                script.status === "rejected" ? "text-red-400" :
                "text-amber-400"
              )}>
                {script.status === "changes_requested" ? "Changes Requested" : script.status}
              </span>
              {script.reviewed_at && (
                <span className="text-[10px] text-[var(--muted)] opacity-50">
                  &middot; {formatTimeAgo(script.reviewed_at)}
                </span>
              )}
            </div>
            {script.client_feedback ? (
              <p className="text-[11px] text-[var(--text)] opacity-80 leading-relaxed whitespace-pre-wrap">
                &ldquo;{script.client_feedback}&rdquo;
              </p>
            ) : (
              <p className="text-[11px] text-[var(--muted)] opacity-50 italic">No feedback provided</p>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2">Tone</p>
            <div className="flex gap-1.5">
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setSelectedTone(t);
                    if (t !== selectedTone) {
                      handleRegenerate(`Rewrite with ${t} tone`);
                    }
                  }}
                  disabled={regenerating}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[11px] font-medium capitalize transition-colors disabled:opacity-40",
                    selectedTone === t
                      ? "border border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                      : "bg-[var(--surface-elevated)] text-[var(--text)] hover:bg-[var(--surface-elevated)]"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {hitlState?.email_subject && !comparing && (
            <div className="mb-4">
              <p className="text-[10px] text-[var(--muted)] opacity-50 mb-0.5">Subject</p>
              <p className="text-[13px] text-[var(--text)] opacity-80">{newSubject ?? (hitlState.email_subject as string)}</p>
            </div>
          )}

          {comparing ? (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="flex flex-col">
                <p className="text-[10px] uppercase text-[var(--muted)] opacity-50 mb-1.5">Previous</p>
                <div className="flex-1 px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[13px] text-[var(--text)] opacity-70 leading-relaxed whitespace-pre-wrap overflow-y-auto max-h-[400px]">
                  {previousDraft}
                </div>
                <button
                  onClick={() => pickDraft("old")}
                  className="mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
                >
                  <RotateCcw size={10} />
                  Keep original
                </button>
              </div>
              <div className="flex flex-col">
                <p className="text-[10px] uppercase text-emerald-400 opacity-80 mb-1.5">New version</p>
                <div className="flex-1 px-4 py-3 bg-[var(--input-bg)] border border-emerald-500/30 rounded-lg text-[13px] text-[var(--text)] opacity-80 leading-relaxed whitespace-pre-wrap overflow-y-auto max-h-[400px]">
                  {newDraft}
                </div>
                <button
                  onClick={() => pickDraft("new")}
                  className="mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                >
                  <Check size={10} />
                  Use this version
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">AI Draft</p>
                  {regenerating && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400">
                      <Loader2 size={10} className="animate-spin" />
                      Regenerating...
                    </span>
                  )}
                </div>
                <div className="flex-1 px-4 py-3 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-[13px] text-[var(--text)] opacity-70 leading-relaxed whitespace-pre-wrap overflow-y-auto min-h-[280px] max-h-[500px]">
                  {chaser.draft_content}
                </div>
              </div>

              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">Your Version</p>
                  <div className="flex items-center gap-2">
                    {saving && <span className="text-[10px] text-[var(--muted)] animate-pulse">Saving...</span>}
                    <span className="text-[10px] text-[var(--muted)] opacity-40">{editedContent.length} chars</span>
                  </div>
                </div>
                <textarea
                  ref={editTextareaRef}
                  value={editedContent}
                  onChange={(e) => handleEditChange(e.target.value)}
                  rows={12}
                  className="flex-1 w-full px-4 py-3 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[13px] text-[var(--text)] opacity-90 leading-relaxed focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] resize-y min-h-[280px]"
                />
              </div>
            </div>
          )}

          {!comparing && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => {
                    setInstruction(chip);
                    handleRegenerate(chip);
                  }}
                  disabled={regenerating}
                  className="px-2.5 py-1 rounded-full text-[10px] bg-[var(--surface-elevated)] text-[var(--text)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)] border border-[var(--border)] transition-colors disabled:opacity-30"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {!comparing && (
            <div className="flex gap-2 mb-4">
              <input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && instruction.trim()) {
                    handleRegenerate();
                  }
                }}
                placeholder="Tell the agent what to change..."
                className="flex-1 px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
              />
              <button
                onClick={() => handleRegenerate()}
                disabled={regenerating || !instruction.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)] disabled:opacity-30"
              >
                {regenerating ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                Regenerate
              </button>
            </div>
          )}

          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2">Send via</p>
            <div className="flex gap-1.5">
              {(["email", "whatsapp", "both"] as const).map((ch) => {
                const disabled =
                  (ch === "whatsapp" && !client.whatsapp_number) ||
                  (ch === "email" && !client.email) ||
                  (ch === "both" && (!client.email || !client.whatsapp_number));
                return (
                  <button
                    key={ch}
                    onClick={() => !disabled && setSelectedChannel(ch)}
                    disabled={disabled}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium capitalize transition-colors",
                      selectedChannel === ch
                        ? "border border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                        : "bg-[var(--surface-elevated)] text-[var(--text)] hover:bg-[var(--surface-elevated)]",
                      disabled && "opacity-30 cursor-not-allowed"
                    )}
                  >
                    {ch === "email" && <Mail size={10} />}
                    {ch === "whatsapp" && <MessageSquare size={10} />}
                    {ch === "both" && <><Mail size={10} /><MessageSquare size={10} /></>}
                    {ch}
                  </button>
                );
              })}
            </div>
            {client.whatsapp_number && client.email && client.avg_response_hours != null && (
              <p className="text-[10px] text-[var(--muted)] opacity-50 mt-1.5">
                {client.name} usually responds in ~{Math.round(client.avg_response_hours)}hrs
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 text-[11px] text-[var(--muted)] mb-2">
            {client.email && (
              <span className="flex items-center gap-1"><Mail size={10} /> {client.email}</span>
            )}
            {client.whatsapp_number && (
              <span className="flex items-center gap-1"><Phone size={10} /> {client.whatsapp_number}</span>
            )}
            {script.assigned_writer && (
              <span>Writer: {script.assigned_writer}</span>
            )}
            {client.avg_response_hours != null && (
              <span>Avg response: {Math.round(client.avg_response_hours)}hrs</span>
            )}
            {client.changes_requested_count > 0 && (
              <span>Changes requested: {client.changes_requested_count}x</span>
            )}
          </div>

          {memories.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2">Client History</p>
              <div className="space-y-1.5">
                {memories.map((m, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] opacity-40 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-[11px] text-[var(--text)] opacity-80">{m.content}</p>
                      <p className="text-[10px] text-[var(--muted)] opacity-40">
                        {m.memory_type} &middot; {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg)] px-6 py-3 flex items-center justify-between">
        <div>
          <button
            onClick={handleReject}
            disabled={loadingAction !== null || comparing || pendingApprove}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-medium border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingAction === "reject" ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            Reject
          </button>
        </div>
        <div className="flex items-center gap-2">
          {pendingApprove && (
            <button
              onClick={handleUndoApprove}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium border border-[var(--border)] text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              <RotateCcw size={11} />
              Undo
            </button>
          )}
          {!isSaved && (
            <button
              onClick={handleSaveDraft}
              disabled={loadingAction !== null || comparing || pendingApprove}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loadingAction === "save" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save Draft
            </button>
          )}
          <button
            onClick={handleApprove}
            disabled={loadingAction !== null || comparing || pendingApprove}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              "bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90"
            )}
          >
            {loadingAction === "approve" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            {isSaved ? "Send Now" : "Approve & Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
