"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { X, ChevronRight, Loader2, Pencil, Send, Save } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { cn, formatTimeAgo, formatStatus } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastProvider";
import type { ScriptWithClient, ScriptStatus } from "@/lib/supabase/types";

const statusOptions: { key: ScriptStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "pending_review", label: "Pending Review" },
  { key: "changes_requested", label: "Changes Requested" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

interface ScriptDetailSheetProps {
  script: ScriptWithClient;
  onClose: () => void;
  onStatusChange: (scriptId: string, newStatus: ScriptStatus) => void;
  onScriptUpdated?: () => void;
}

export default function ScriptDetailSheet({ script, onClose, onStatusChange, onScriptUpdated }: ScriptDetailSheetProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(script.content);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const canResend = script.status === "changes_requested" || script.status === "rejected";
  const canEdit = script.status !== "approved" && script.status !== "closed";

  async function handleStatusChange(newStatus: ScriptStatus) {
    if (newStatus === script.status) {
      setShowStatusMenu(false);
      return;
    }
    setChangingStatus(true);
    try {
      const res = await fetch(`/api/scripts/${script.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        onStatusChange(script.id, newStatus);
        toast("success", `Status changed to ${formatStatus(newStatus)}`);
      } else {
        toast("error", "Failed to change status");
      }
    } catch {
      toast("error", "Failed to change status");
    } finally {
      setChangingStatus(false);
      setShowStatusMenu(false);
    }
  }

  async function handleSaveEdit() {
    if (editContent === script.content) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/scripts/${script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      if (res.ok) {
        toast("success", "Script content updated");
        setEditing(false);
        onScriptUpdated?.();
      } else {
        toast("error", "Failed to save changes");
      }
    } catch {
      toast("error", "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendDraft() {
    setSending(true);
    try {
      const res = await fetch(`/api/scripts/${script.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_channel: script.client.preferred_channel || "email",
        }),
      });
      if (res.ok) {
        toast("success", "Script sent for review");
        onStatusChange(script.id, "pending_review");
        onScriptUpdated?.();
      } else {
        const data = await res.json();
        toast("error", data.error || "Failed to send");
      }
    } catch {
      toast("error", "Failed to send script");
    } finally {
      setSending(false);
    }
  }

  async function handleResend() {
    // Save any pending edits first
    if (editing && editContent !== script.content) {
      const saveRes = await fetch(`/api/scripts/${script.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      if (!saveRes.ok) {
        toast("error", "Failed to save changes before resending");
        return;
      }
    }

    setSending(true);
    try {
      const res = await fetch(`/api/scripts/${script.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_channel: script.client.preferred_channel || "email",
        }),
      });
      if (res.ok) {
        toast("success", "Script resent for review with a new link");
        onStatusChange(script.id, "pending_review");
        onScriptUpdated?.();
        setEditing(false);
      } else {
        const data = await res.json();
        toast("error", data.error || "Failed to resend");
      }
    } catch {
      toast("error", "Failed to resend script");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-screen w-full max-w-md z-50 bg-[var(--card)] border-l border-[var(--border)] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text)] truncate pr-4">
            {script.title}
          </h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)] shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div className="relative">
            <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2">Status</p>
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className="flex items-center gap-2 group"
            >
              <StatusBadge status={script.status} />
              <ChevronRight size={12} className="text-[var(--muted)] opacity-0 group-hover:opacity-60" />
              {changingStatus && <Loader2 size={12} className="text-[var(--muted)] animate-spin" />}
            </button>

            {showStatusMenu && (
              <div className="absolute left-0 top-full mt-1 z-10 bg-[var(--card)] border border-[var(--border)] rounded shadow-lg py-1 min-w-[180px]">
                {statusOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => handleStatusChange(opt.key)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--surface-elevated)]",
                      opt.key === script.status
                        ? "text-[var(--text)] font-medium"
                        : "text-[var(--muted)]"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {canResend && (
            <div className={cn(
              "p-3 rounded-lg border",
              script.status === "changes_requested"
                ? "bg-orange-500/5 border-orange-500/20"
                : "bg-red-500/5 border-red-500/20"
            )}>
              <p className="text-xs text-[var(--text)] font-medium mb-1">
                {script.status === "changes_requested"
                  ? "Client requested changes"
                  : "Client rejected this script"}
              </p>
              <p className="text-[11px] text-[var(--muted)] mb-3">
                Edit the script below, then resend for review. A new review link will be generated.
              </p>
              <div className="flex gap-2">
                {!editing && (
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
                  >
                    <Pencil size={11} />
                    Edit Script
                  </button>
                )}
                <button
                  onClick={handleResend}
                  disabled={sending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 disabled:opacity-50"
                >
                  {sending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                  {sending ? "Sending..." : "Resend for Review"}
                </button>
              </div>
            </div>
          )}

          {script.status === "draft" && (
            <div className="p-3 rounded-lg border bg-[var(--surface-elevated)] border-[var(--border)]">
              <p className="text-xs text-[var(--text)] font-medium mb-1">
                Ready to send?
              </p>
              <p className="text-[11px] text-[var(--muted)] mb-3">
                Send this script to the client for review via {script.client.preferred_channel || "email"}.
              </p>
              <button
                onClick={handleSendDraft}
                disabled={sending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 disabled:opacity-50"
              >
                {sending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                {sending ? "Sending..." : "Send for Review"}
              </button>
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2">Client</p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] flex items-center justify-center text-[10px] font-medium text-[var(--muted)]">
                {script.client.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <Link href={`/clients/${script.client.id}`} className="text-sm text-[var(--text)] hover:underline">{script.client.name}</Link>
                {script.client.company && (
                  <p className="text-[11px] text-[var(--muted)] opacity-60">{script.client.company}</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {script.version > 1 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-1">Version</p>
                <p className="text-sm text-[var(--text)]">v{script.version}</p>
              </div>
            )}
            {script.due_date && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-1">Due Date</p>
                <p className="text-sm text-[var(--text)]">
                  {new Date(script.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            )}
            {script.sent_at && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-1">Sent</p>
                <p className="text-sm text-[var(--text)]">{formatTimeAgo(script.sent_at)}</p>
              </div>
            )}
            {script.reviewed_at && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-1">Reviewed</p>
                <p className="text-sm text-[var(--text)]">{formatTimeAgo(script.reviewed_at)}</p>
              </div>
            )}
          </div>

          {script.client_feedback && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2">Client Feedback</p>
              <div className="bg-[var(--input-bg)] border border-[var(--border)] rounded-lg px-4 py-3">
                <p className="text-sm text-[var(--text)] opacity-80 leading-relaxed">{script.client_feedback}</p>
              </div>
            </div>
          )}

          {script.quality_score && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50 mb-2">Script Quality</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["hook_strength", "Hook"],
                  ["cta_clarity", "CTA"],
                  ["brand_alignment", "Brand"],
                  ["platform_fit", "Platform"],
                  ["pacing_structure", "Pacing"],
                  ["tone_consistency", "Tone"],
                ] as const).map(([key, label]) => {
                  const val = (script.quality_score as Record<string, unknown>)?.[key];
                  if (val == null) return null;
                  const num = typeof val === "number" ? val : 0;
                  return (
                    <div key={key} className="flex items-center justify-between bg-[var(--input-bg)] border border-[var(--border)] rounded px-3 py-1.5">
                      <span className="text-[11px] text-[var(--muted)]">{label}</span>
                      <span className={cn("text-xs font-medium", num >= 8 ? "text-emerald-400" : num >= 5 ? "text-amber-400" : "text-red-400")}>
                        {num}/10
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between bg-[var(--input-bg)] border border-[var(--border)] rounded px-3 py-1.5 col-span-2">
                  <span className="text-[11px] text-[var(--muted)]">Average</span>
                  <span className={cn("text-xs font-semibold", script.quality_score.average >= 8 ? "text-emerald-400" : script.quality_score.average >= 5 ? "text-amber-400" : "text-red-400")}>
                    {script.quality_score.average}/10
                  </span>
                </div>
              </div>
              {script.quality_score.feedback && (
                <p className="text-[11px] text-[var(--muted)] opacity-70 italic mt-2">{script.quality_score.feedback}</p>
              )}
              {script.quality_score.strengths && script.quality_score.strengths.length > 0 && (
                <div className="mt-2">
                  {script.quality_score.strengths.map((s, i) => (
                    <p key={i} className="text-[11px] text-emerald-400/80">+ {s}</p>
                  ))}
                </div>
              )}
              {script.quality_score.improvements && script.quality_score.improvements.length > 0 && (
                <div className="mt-1">
                  {script.quality_score.improvements.map((s, i) => (
                    <p key={i} className="text-[11px] text-amber-400/80">- {s}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-50">Script Content</p>
              {canEdit && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1 text-[10px] text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <Pencil size={10} />
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full bg-[var(--input-bg)] border border-[var(--accent-primary)]/30 rounded-lg px-4 py-3 font-mono text-sm text-[var(--text)] opacity-80 whitespace-pre-wrap leading-relaxed resize-y min-h-[300px] focus:outline-none focus:border-[var(--accent-primary)]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    onClick={() => { setEditing(false); setEditContent(script.content); }}
                    className="px-3 py-1.5 rounded text-[11px] text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-[var(--input-bg)] border border-[var(--border)] rounded-lg px-4 py-3 max-h-[400px] overflow-y-auto">
                <pre className="font-mono text-sm text-[var(--text)] opacity-80 whitespace-pre-wrap leading-relaxed">
                  {script.content}
                </pre>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}
