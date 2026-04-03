"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, X, Loader2, CheckCircle, Circle, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { isOverdue, getScriptAge } from "@/lib/utils";
import type { ScriptStatus } from "@/lib/supabase/types";

interface ScriptInfo {
  id: string;
  title: string;
  status: ScriptStatus;
  sent_at: string | null;
  client_name?: string;
  due_date?: string | null;
  response_deadline_minutes?: number;
}

interface StreamEvent {
  node: string;
  status: "started" | "completed" | "error";
  timestamp: string;
  data?: Record<string, unknown>;
}

const NODE_LABELS: Record<string, string> = {
  ragRetrieval: "Retrieving client memory...",
  sentimentAnalysis: "Analysing sentiment...",
  generation: "Generating draft...",
  selfCritique: "Running self-critique...",
  revision: "Revising draft...",
};

interface RunAgentButtonProps {
  scripts: ScriptInfo[];
  mode: "batch" | "single";
  singleScript?: { id: string; title: string; client_name: string; due_date: string | null };
  onOpenChange?: (open: boolean) => void;
}

interface BatchScriptProgress {
  id: string;
  title: string;
  client_name: string;
  status: "queued" | "running" | "done" | "error";
  currentNode: string | null;
  completedNodes: string[];
  error?: string;
}

export default function RunAgentButton({ scripts, mode, singleScript, onOpenChange }: RunAgentButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(mode === "single");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const [completedNodes, setCompletedNodes] = useState<string[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [batchProgress, setBatchProgress] = useState<BatchScriptProgress[]>([]);
  const batchEsRefs = useRef<Map<string, EventSource>>(new Map());

  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      batchEsRefs.current.forEach((es) => es.close());
      batchEsRefs.current.clear();
    };
  }, []);

  const overdueScripts = scripts
    .filter((s) => isOverdue(s.sent_at, s.status, s.response_deadline_minutes) || s.status === "overdue")
    .sort((a, b) => {
      const ageA = a.sent_at ? getScriptAge(a.sent_at) : 0;
      const ageB = b.sent_at ? getScriptAge(b.sent_at) : 0;
      return ageB - ageA;
    });

  const hasOverdue = overdueScripts.length > 0;

  function openConfirm() {
    if (mode === "batch" && !hasOverdue) return;
    setConfirmOpen(true);
    onOpenChange?.(true);
    setRunning(false);
    setDone(false);
    setCurrentNode(null);
    setCompletedNodes([]);
    setBatchProgress([]);
  }

  function close() {
    eventSourceRef.current?.close();
    batchEsRefs.current.forEach((es) => es.close());
    batchEsRefs.current.clear();
    setConfirmOpen(false);
    setRunning(false);
    onOpenChange?.(false);
  }

  const runSingle = useCallback(async (scriptId: string) => {
    setRunning(true);
    setCurrentNode(null);
    setCompletedNodes([]);
    setDone(false);

    const es = new EventSource(`/api/agent/stream/${scriptId}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: StreamEvent = JSON.parse(e.data);
        if (event.node === "done" || event.node === "result") {
          setRunning(false);
          setDone(true);
          es.close();
          if (event.node === "result" && event.status === "error") {
            toast("error", `Agent error: ${event.data?.error ?? "unknown"}`);
          } else {
            toast("success", "Draft ready — review in HITL panel");
          }
          return;
        }
        if (event.node !== "pipeline" && NODE_LABELS[event.node]) {
          if (event.status === "started") setCurrentNode(event.node);
          if (event.status === "completed") {
            setCompletedNodes((prev) => [...prev, event.node]);
            setCurrentNode(null);
          }
        }
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      setRunning(false);
      setDone(true);
      es.close();
    };

    try {
      const res = await fetch(`/api/agent/process-queue?scriptId=${scriptId}`);
      if (!res.ok) {
        const data = await res.json();
        if (data.skipped && data.reason === "chaser_exists") {
          toast("info", "Draft already exists in HITL panel");
        } else if (data.error) {
          toast("error", data.error);
        }
        setRunning(false);
        setDone(true);
        es.close();
      }
    } catch {
      toast("error", "Failed to trigger agent");
      setRunning(false);
      setDone(true);
      es.close();
    }
  }, [toast]);

  const runBatch = useCallback(async () => {
    setRunning(true);
    setDone(false);

    const initial: BatchScriptProgress[] = overdueScripts.map((s) => ({
      id: s.id,
      title: s.title,
      client_name: s.client_name ?? "Unknown",
      status: "queued",
      currentNode: null,
      completedNodes: [],
    }));
    setBatchProgress(initial);

    let completedCount = 0;
    const total = overdueScripts.length;

    function checkAllDone() {
      completedCount++;
      if (completedCount >= total) {
        setRunning(false);
        setDone(true);
      }
    }

    for (const script of overdueScripts) {
      const es = new EventSource(`/api/agent/stream/${script.id}`);
      batchEsRefs.current.set(script.id, es);

      es.onmessage = (e) => {
        try {
          const event: StreamEvent = JSON.parse(e.data);
          if (event.node === "done" || event.node === "result") {
            es.close();
            batchEsRefs.current.delete(script.id);
            const isError = event.node === "result" && event.status === "error";
            setBatchProgress((prev) =>
              prev.map((p) => p.id === script.id ? {
                ...p,
                status: isError ? "error" : "done",
                currentNode: null,
                error: isError ? String(event.data?.error ?? "unknown") : undefined,
              } : p)
            );
            checkAllDone();
            return;
          }
          if (event.node !== "pipeline" && NODE_LABELS[event.node]) {
            setBatchProgress((prev) =>
              prev.map((p) => {
                if (p.id !== script.id) return p;
                if (event.status === "started") {
                  return { ...p, status: "running", currentNode: event.node };
                }
                if (event.status === "completed") {
                  return { ...p, currentNode: null, completedNodes: [...p.completedNodes, event.node] };
                }
                return p;
              })
            );
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        es.close();
        batchEsRefs.current.delete(script.id);
        setBatchProgress((prev) =>
          prev.map((p) => p.id === script.id ? { ...p, status: "error", currentNode: null, error: "Connection lost" } : p)
        );
        checkAllDone();
      };

      try {
        const res = await fetch(`/api/agent/process-queue?scriptId=${script.id}`);
        if (!res.ok) {
          const data = await res.json();
          es.close();
          batchEsRefs.current.delete(script.id);
          setBatchProgress((prev) =>
            prev.map((p) => p.id === script.id ? {
              ...p,
              status: data.skipped ? "done" : "error",
              currentNode: null,
              error: data.skipped ? undefined : (data.error ?? "Failed"),
            } : p)
          );
          checkAllDone();
        }
      } catch {
        es.close();
        batchEsRefs.current.delete(script.id);
        setBatchProgress((prev) =>
          prev.map((p) => p.id === script.id ? { ...p, status: "error", currentNode: null, error: "Network error" } : p)
        );
        checkAllDone();
      }
    }
  }, [overdueScripts]);

  if (mode === "single" && singleScript) {
    return (
      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/60 dark:bg-[var(--bg)]/80 backdrop-blur-md" onClick={close} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                <h3 className="text-sm font-semibold text-[var(--text)]">Run Chase Agent</h3>
                <button onClick={close} className="text-[var(--muted)] hover:text-[var(--text)]">
                  <X size={14} />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                {!running && !done && (
                  <>
                    <div className="bg-[var(--input-bg)] border border-[var(--border)] rounded-lg p-4">
                      <p className="text-sm font-medium text-[var(--text)] mb-1">{singleScript.title}</p>
                      <p className="text-xs text-[var(--muted)] mb-1">Client: {singleScript.client_name}</p>
                      {singleScript.due_date && (
                        <p className="text-xs text-[var(--muted)] opacity-60">
                          Due: {new Date(singleScript.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      Claude will analyse {singleScript.client_name}&apos;s approval history and generate a personalised follow-up message for your review before anything is sent.
                    </p>
                  </>
                )}

                {(running || done) && (
                  <NodeProgressList currentNode={currentNode} completedNodes={completedNodes} done={done} />
                )}
              </div>

              {!running && !done && (
                <div className="flex gap-3 px-5 py-4 border-t border-[var(--border)]">
                  <button onClick={close} className="flex-1 px-4 py-2 rounded text-xs font-medium border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-elevated)]">
                    Cancel
                  </button>
                  <button
                    onClick={() => runSingle(singleScript.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded text-xs font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90"
                  >
                    <Bot size={12} />
                    Run Agent
                  </button>
                </div>
              )}

              {done && (
                <div className="flex gap-3 px-5 py-4 border-t border-[var(--border)]">
                  <button onClick={close} className="flex-1 px-4 py-2 rounded text-xs font-medium border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-elevated)]">
                    Close
                  </button>
                  <button
                    onClick={() => { close(); router.push("/hitl"); }}
                    className="flex-1 px-4 py-2 rounded text-xs font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90"
                  >
                    Review in HITL
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <>
      <div className="relative group">
        <button
          onClick={openConfirm}
          disabled={!hasOverdue}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-[var(--border)] ${
            hasOverdue
              ? "text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
              : "text-[var(--muted)] opacity-40 cursor-not-allowed"
          }`}
          title={hasOverdue ? `Run agent on ${overdueScripts.length} overdue script${overdueScripts.length > 1 ? "s" : ""}` : "No overdue scripts right now"}
        >
          <Bot size={13} />
          Run Agent{hasOverdue ? ` (${overdueScripts.length})` : ""}
        </button>
      </div>

      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/60 dark:bg-[var(--bg)]/80 backdrop-blur-md" onClick={close} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                <h3 className="text-sm font-semibold text-[var(--text)]">Run Chase Agent</h3>
                <button onClick={close} className="text-[var(--muted)] hover:text-[var(--text)]">
                  <X size={14} />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {!running && !done && (
                  <>
                    <p className="text-xs text-[var(--muted)] leading-relaxed">
                      Generate chase drafts for all {overdueScripts.length} overdue script{overdueScripts.length > 1 ? "s" : ""}. Drafts will appear in the HITL panel for your review before anything is sent.
                    </p>
                    <div className="space-y-2">
                      {overdueScripts.map((s) => {
                        const days = s.sent_at ? Math.round(getScriptAge(s.sent_at) / 24) : 0;
                        return (
                          <div key={s.id} className="flex items-center justify-between bg-[var(--input-bg)] border border-[var(--border)] rounded-lg px-4 py-2.5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[var(--text)] truncate">{s.title}</p>
                              {s.client_name && <p className="text-xs text-[var(--muted)] truncate">{s.client_name}</p>}
                            </div>
                            <span className="text-xs text-red-400 shrink-0 ml-2">{days}d overdue</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {(running || done) && (
                  <div className="space-y-3">
                    {batchProgress.map((p) => (
                      <div key={p.id} className="bg-[var(--input-bg)] border border-[var(--border)] rounded-lg px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-medium text-[var(--text)] truncate">{p.title}</p>
                          {p.status === "done" && <CheckCircle size={13} className="text-[var(--accent-success)] shrink-0" />}
                          {p.status === "error" && <AlertCircle size={13} className="text-red-400 shrink-0" />}
                          {p.status === "running" && <Loader2 size={13} className="text-[var(--accent-success)] animate-spin shrink-0" />}
                          {p.status === "queued" && <Circle size={13} className="text-[var(--muted)] shrink-0" />}
                        </div>
                        <p className="text-[11px] text-[var(--muted)] truncate">{p.client_name}</p>
                        {p.status === "running" && p.currentNode && (
                          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-[11px] text-[var(--accent-success)] mt-1">{NODE_LABELS[p.currentNode] ?? p.currentNode}</motion.p>
                        )}
                        {p.status === "error" && p.error && (
                          <p className="text-[11px] text-red-400 mt-1">{p.error}</p>
                        )}
                        {p.status === "done" && (
                          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-[11px] text-[var(--accent-success)] mt-1">Draft ready</motion.p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!running && !done && (
                <div className="flex gap-3 px-5 py-4 border-t border-[var(--border)]">
                  <button onClick={close} className="flex-1 px-4 py-2 rounded text-xs font-medium border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-elevated)]">
                    Cancel
                  </button>
                  <button
                    onClick={runBatch}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded text-xs font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90"
                  >
                    <Bot size={12} />
                    Run on All ({overdueScripts.length})
                  </button>
                </div>
              )}

              {done && (
                <div className="flex gap-3 px-5 py-4 border-t border-[var(--border)]">
                  <button onClick={close} className="flex-1 px-4 py-2 rounded text-xs font-medium border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-elevated)]">
                    Close
                  </button>
                  <button
                    onClick={() => { close(); router.push("/hitl"); }}
                    className="flex-1 px-4 py-2 rounded text-xs font-bold bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90"
                  >
                    Review in HITL
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function NodeProgressList({ currentNode, completedNodes, done }: { currentNode: string | null; completedNodes: string[]; done: boolean }) {
  return (
    <div className="space-y-2.5">
      {Object.entries(NODE_LABELS).map(([key, label]) => {
        const isCompleted = completedNodes.includes(key);
        const isCurrent = currentNode === key;
        return (
          <motion.div
            key={key}
            className="flex items-center gap-2.5"
            initial={isCurrent ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
          >
            {isCompleted ? (
              <CheckCircle size={14} className="text-[var(--accent-success)] shrink-0" />
            ) : isCurrent ? (
              <Loader2 size={14} className="text-[var(--accent-success)] animate-spin shrink-0" />
            ) : (
              <Circle size={14} className="text-[var(--muted)] shrink-0" />
            )}
            <span className={`text-xs ${
              isCompleted ? "text-[var(--text)]" :
              isCurrent ? "text-[var(--accent-success)] font-medium" :
              "text-[var(--muted)]"
            }`}>
              {label}
            </span>
          </motion.div>
        );
      })}
      {done && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-[var(--accent-success)] font-medium pt-2"
        >
          Draft ready in HITL panel
        </motion.p>
      )}
    </div>
  );
}
