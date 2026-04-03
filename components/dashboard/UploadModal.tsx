"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Upload, Loader2, Check, AlertTriangle, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ClientItem } from "./DashboardShell";

type ToastState = { type: "success" | "error"; message: string } | null;

interface QualityScore {
  hook_strength: number;
  cta_clarity: number;
  tone_consistency?: number | null;
  brand_alignment?: number;
  platform_fit?: number;
  pacing_structure?: number;
  average: number;
  feedback?: string;
  strengths?: string[];
  improvements?: string[];
}

function Toast({ toast, onDismiss }: { toast: NonNullable<ToastState>; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={cn(
        "fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium z-[60] border",
        toast.type === "success"
          ? "bg-[var(--card)] text-[var(--text)] border-emerald-500/20"
          : "bg-[var(--card)] text-red-400 border-red-500/20"
      )}
    >
      {toast.message}
    </motion.div>
  );
}

interface UploadModalProps {
  clients: ClientItem[];
  onScriptUploaded?: () => void;
}

export default function UploadModal({ clients, onScriptUploaded }: UploadModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [scoreResult, setScoreResult] = useState<{ score: QualityScore; scriptId: string; reviewChannel: string } | null>(null);

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [content, setContent] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reviewChannel, setReviewChannel] = useState("email");
  const [responseDeadline, setResponseDeadline] = useState("2880");

  const selectedClient = clients.find((c) => c.id === clientId);

  const handleClientChange = useCallback((id: string) => {
    setClientId(id);
    const c = clients.find((cl) => cl.id === id);
    if (c) {
      setReviewChannel(c.preferred_channel || "email");
    }
  }, [clients]);

  function resetForm() {
    setTitle("");
    setClientId("");
    setContent("");
    setDueDate("");
    setReviewChannel("email");
    setResponseDeadline("2880");
    setScoreResult(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title || !clientId || !content) return;

    setIsLoading(true);

    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          client_id: clientId,
          due_date: dueDate || undefined,
          review_channel: reviewChannel,
          response_deadline_minutes: parseInt(responseDeadline, 10),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create script");
      }

      const data = await res.json();
      const score = data.quality_score as QualityScore | null;
      const returnedChannel = data.review_channel as string;

      if (score && score.average < 6) {
        setScoreResult({ score, scriptId: data.id, reviewChannel: returnedChannel });
        setIsLoading(false);
        return;
      }

      await sendScript(data.id, returnedChannel);

      setIsOpen(false);
      resetForm();
      setToast({ type: "success", message: score ? `Script scored ${score.average}/10 — sent for review` : "Script sent for review" });
      onScriptUploaded?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setToast({ type: "error", message });
    } finally {
      setIsLoading(false);
    }
  }

  async function sendScript(scriptId: string, channel: string) {
    const res = await fetch(`/api/scripts/${scriptId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_channel: channel }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to send script");
    }
  }

  async function handleSendAnyway() {
    if (!scoreResult) return;
    setIsSending(true);
    try {
      await sendScript(scoreResult.scriptId, scoreResult.reviewChannel);
      setIsOpen(false);
      resetForm();
      setToast({ type: "success", message: `Script scored ${scoreResult.score.average}/10 — sent anyway` });
      onScriptUploaded?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setToast({ type: "error", message });
    } finally {
      setIsSending(false);
    }
  }

  async function handleSaveAsDraft() {
    if (!title || !clientId || !content) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          client_id: clientId,
          due_date: dueDate || undefined,
          review_channel: reviewChannel,
          response_deadline_minutes: parseInt(responseDeadline, 10),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save draft");
      }
      setIsOpen(false);
      resetForm();
      setToast({ type: "success", message: "Script saved as draft" });
      onScriptUploaded?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setToast({ type: "error", message });
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeepAsDraft() {
    setIsOpen(false);
    resetForm();
    setToast({ type: "success", message: "Script saved as draft" });
    onScriptUploaded?.();
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-1.5 rounded-[4px] bg-[var(--text)] text-[var(--bg)] text-xs font-semibold hover:opacity-80"
      >
        <Upload size={14} />
        Add Script
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-2xl"
            >
              <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
                <h2 className="text-base font-semibold text-[var(--text)]">Add Script</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div>
                  <label htmlFor="title" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                    Script Title
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="e.g. Summer Campaign - Hero Video"
                    className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 focus:outline-none focus:border-[#333333] transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="client" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                    Client
                  </label>
                  <select
                    id="client"
                    value={clientId}
                    onChange={(e) => handleClientChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] focus:outline-none focus:border-[#333333] transition-colors"
                  >
                    <option value="" disabled>
                      Select a client
                    </option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.whatsapp_number ? "" : ""}{c.email ? "" : " (no email)"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="content" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                    Script Content
                  </label>
                  <textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    required
                    rows={8}
                    placeholder="Paste your script here..."
                    className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--muted)]/50 focus:outline-none focus:border-[#333333] transition-colors resize-y min-h-[200px]"
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label htmlFor="due_date" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                      Due Date
                    </label>
                    <input
                      id="due_date"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] focus:outline-none focus:border-[#333333] transition-colors"
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="review_channel" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                      Send via
                    </label>
                    <select
                      id="review_channel"
                      value={reviewChannel}
                      onChange={(e) => setReviewChannel(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] focus:outline-none focus:border-[#333333] transition-colors"
                    >
                      <option value="email">Email</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="both">Both</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="response_deadline" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                    Response Deadline
                  </label>
                  <select
                    id="response_deadline"
                    value={responseDeadline}
                    onChange={(e) => setResponseDeadline(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] focus:outline-none focus:border-[#333333] transition-colors"
                  >
                    <option value="5">5 minutes (testing)</option>
                    <option value="60">1 hour</option>
                    <option value="240">4 hours</option>
                    <option value="720">12 hours</option>
                    <option value="1440">1 day</option>
                    <option value="2880">2 days</option>
                    <option value="5760">4 days</option>
                    <option value="7200">5 days</option>
                  </select>
                </div>

                {selectedClient && !selectedClient.email && !selectedClient.whatsapp_number && (
                  <p className="text-xs text-amber-400">This client has no contact info configured. Delivery will fail.</p>
                )}

                {selectedClient && selectedClient.monthly_volume && (selectedClient.total_scripts ?? 0) >= selectedClient.monthly_volume && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                    <p className="text-xs text-amber-400">
                      Monthly quota reached ({selectedClient.total_scripts ?? 0}/{selectedClient.monthly_volume} scripts). You can still save, but the client&apos;s plan may need updating.
                    </p>
                  </div>
                )}

                {scoreResult ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={14} className="text-amber-400" />
                        <span className="text-sm font-medium text-amber-400">
                          Quality Score: {scoreResult.score.average}/10
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-[var(--muted)]">
                        {([
                          ["hook_strength", "Hook Strength"],
                          ["cta_clarity", "CTA Clarity"],
                          ["brand_alignment", "Brand Alignment"],
                          ["platform_fit", "Platform Fit"],
                          ["pacing_structure", "Pacing"],
                          ["tone_consistency", "Tone Match"],
                        ] as const).map(([key, label]) => {
                          const val = (scoreResult.score as unknown as Record<string, unknown>)[key];
                          if (val == null) return null;
                          const num = typeof val === "number" ? val : 0;
                          return (
                            <div key={key} className="flex justify-between">
                              <span>{label}</span>
                              <span className={cn(num < 6 ? "text-red-400" : "text-[var(--text)]")}>
                                {num}/10
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {scoreResult.score.feedback && (
                        <p className="text-[11px] text-[var(--muted)] opacity-70 italic mt-2">{scoreResult.score.feedback}</p>
                      )}
                      {scoreResult.score.improvements && scoreResult.score.improvements.length > 0 && (
                        <div className="mt-1">
                          {scoreResult.score.improvements.map((s) => (
                            <p key={s} className="text-[11px] text-amber-400/80">- {s}</p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleKeepAsDraft}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-[4px] bg-[var(--surface-elevated)] text-[var(--text)] text-sm font-medium border border-[var(--border)] hover:bg-[var(--border)]"
                      >
                        <FileText size={14} />
                        Keep as Draft
                      </button>
                      <button
                        type="button"
                        onClick={handleSendAnyway}
                        disabled={isSending}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-[4px] bg-amber-500/20 text-amber-400 text-sm font-semibold border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50"
                      >
                        {isSending ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <AlertTriangle size={14} />
                            Send Anyway
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isLoading || !title || !clientId || !content}
                      onClick={handleSaveAsDraft}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-[4px] bg-[var(--surface-elevated)] text-[var(--text)] text-sm font-medium border border-[var(--border)] hover:bg-[var(--border)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FileText size={14} />
                      Save as Draft
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || !title || !clientId || !content}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-[4px] bg-[var(--text)] text-[var(--bg)] text-sm font-semibold hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Scoring &amp; saving...
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          Send for Review
                        </>
                      )}
                    </button>
                  </div>
                )}
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
      </AnimatePresence>
    </>
  );
}
