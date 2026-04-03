"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, X, Loader2, CheckCircle, AlertCircle, Circle } from "lucide-react";

interface StreamEvent {
  node: string;
  status: "started" | "completed" | "error";
  timestamp: string;
  data?: Record<string, unknown>;
}

const PIPELINE_NODES = [
  "ragRetrieval",
  "sentimentAnalysis",
  "generation",
  "selfCritique",
  "revision",
];

const NODE_LABELS: Record<string, string> = {
  ragRetrieval: "RAG Retrieval",
  sentimentAnalysis: "Sentiment",
  generation: "Generation",
  selfCritique: "Self-Critique",
  revision: "Revision",
};

interface AgentTracePanelProps {
  scriptId: string;
  scriptTitle: string;
  onClose: () => void;
}

export default function AgentTracePanel({
  scriptId,
  scriptTitle,
  onClose,
}: AgentTracePanelProps) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startAgent = useCallback(() => {
    if (running) return;

    setRunning(true);
    setDone(false);
    setEvents([]);

    const es = new EventSource(`/api/agent/stream/${scriptId}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: StreamEvent = JSON.parse(e.data);
        if (event.node === "done") {
          setRunning(false);
          setDone(true);
          es.close();
          return;
        }
        setEvents((prev) => [...prev, event]);
      } catch {}
    };

    es.onerror = () => {
      setRunning(false);
      setDone(true);
      es.close();
    };
  }, [scriptId, running]);

  const nodeStatuses = new Map<string, "pending" | "running" | "completed" | "error">();
  for (const node of PIPELINE_NODES) {
    nodeStatuses.set(node, "pending");
  }
  for (const event of events) {
    if (!PIPELINE_NODES.includes(event.node)) continue;
    if (event.status === "started") nodeStatuses.set(event.node, "running");
    if (event.status === "completed") nodeStatuses.set(event.node, "completed");
    if (event.status === "error") nodeStatuses.set(event.node, "error");
  }

  const resultEvent = events.find((e) => e.node === "result");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="bg-[var(--card)] border border-[var(--border)] rounded overflow-hidden"
    >
      <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text)] truncate">
            Agent Trace: {scriptTitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!running && !done && (
            <button
              onClick={startAgent}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-[var(--text)] text-[var(--bg)] text-xs font-medium hover:opacity-80"
            >
              <Play size={12} />
              Run
            </button>
          )}
          {running && (
            <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <Loader2 size={12} className="animate-spin" />
              Running
            </span>
          )}
          <button
            onClick={() => {
              eventSourceRef.current?.close();
              onClose();
            }}
            className="p-1 text-[var(--muted)] opacity-60 hover:text-[var(--muted)]"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-center gap-1">
          {PIPELINE_NODES.map((node, i) => {
            const status = nodeStatuses.get(node) ?? "pending";
            return (
              <div key={node} className="flex items-center gap-1">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full border"
                    style={{
                      borderColor: status === "completed" ? "#34d399" : status === "running" ? "#fbbf24" : status === "error" ? "#ef4444" : "var(--border)",
                      backgroundColor: status === "completed" ? "rgba(52,211,153,0.1)" : status === "running" ? "rgba(251,191,36,0.1)" : status === "error" ? "rgba(239,68,68,0.1)" : undefined,
                      boxShadow: status === "completed" ? "0 0 8px rgba(52,211,153,0.25)" : status === "running" ? "0 0 8px rgba(251,191,36,0.2)" : status === "error" ? "0 0 8px rgba(239,68,68,0.2)" : undefined,
                    }}
                  >
                    {status === "pending" && <Circle size={10} className="text-[var(--muted)] opacity-40" />}
                    {status === "running" && <Loader2 size={10} className="text-amber-400 animate-spin" />}
                    {status === "completed" && <CheckCircle size={10} className="text-emerald-400" />}
                    {status === "error" && <AlertCircle size={10} className="text-red-400" />}
                  </div>
                  <span className="text-[9px] text-[var(--muted)] whitespace-nowrap">
                    {NODE_LABELS[node]}
                  </span>
                </div>
                {i < PIPELINE_NODES.length - 1 && (
                  <div className="w-4 h-px bg-[var(--border)] mb-4" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {events.length > 0 && (
        <div className="px-5 pb-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] opacity-60 mb-2">
            Execution Log
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            <AnimatePresence>
              {events
                .filter((e) => e.node !== "pipeline" && e.node !== "done")
                .map((event, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-2 text-xs"
                  >
                    <span className="text-[var(--muted)] opacity-40 font-mono shrink-0">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={
                      event.status === "error"
                        ? "text-red-400"
                        : event.status === "completed"
                        ? "text-[var(--text)] opacity-80"
                        : "text-amber-400"
                    }>
                      {NODE_LABELS[event.node] ?? event.node}{" "}
                      {event.status === "started" ? "started" : event.status === "completed" ? "done" : "failed"}
                    </span>
                    {event.data && (
                      <span className="text-[var(--muted)] opacity-60 truncate">
                        {Object.entries(event.data)
                          .filter(([, v]) => v != null)
                          .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                          .join(", ")}
                      </span>
                    )}
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {resultEvent?.data && done && (
        <div className="px-5 pb-4 border-t border-[var(--border)] pt-3">
          <p className="text-xs text-[var(--muted)]">
            {resultEvent.status === "error"
              ? `Error: ${resultEvent.data.error}`
              : `Draft generated. Urgency: ${resultEvent.data.urgencyScore}/10, Tone: ${resultEvent.data.toneRecommendation}, Revisions: ${resultEvent.data.revisionCount}`}
          </p>
        </div>
      )}
    </motion.div>
  );
}
