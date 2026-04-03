"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Upload, FileEdit, Search, Undo2 } from "lucide-react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { createClient } from "@/lib/supabase/client";
import ScriptCard from "./ScriptCard";
import ScriptDetailSheet from "./ScriptDetailSheet";
import RunAgentButton from "./RunAgentButton";
import { isOverdue } from "@/lib/utils";
import type { ScriptWithClient, Script, ScriptStatus } from "@/lib/supabase/types";

type ColumnKey = "draft" | "pending_review" | "changes_requested" | "approved" | "overdue" | "rejected";

const columns: { key: ColumnKey; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "pending_review", label: "Pending Review" },
  { key: "changes_requested", label: "Changes Requested" },
  { key: "approved", label: "Approved" },
  { key: "overdue", label: "Overdue" },
  { key: "rejected", label: "Rejected" },
];

const columnToStatus: Partial<Record<ColumnKey, ScriptStatus>> = {
  draft: "draft",
  pending_review: "pending_review",
  changes_requested: "changes_requested",
  approved: "approved",
  rejected: "rejected",
};

function categorizeScript(script: ScriptWithClient): ColumnKey | null {
  if (script.status === "closed") return null;
  if (script.status === "draft") return "draft";
  if (script.status === "escalated") return "overdue";
  if (script.status === "overdue") return "overdue";
  if (isOverdue(script.sent_at, script.status, script.response_deadline_minutes)) return "overdue";
  if (script.status === "pending_review") return "pending_review";
  if (script.status === "changes_requested") return "changes_requested";
  if (script.status === "approved") return "approved";
  if (script.status === "rejected") return "rejected";
  return null;
}

interface KanbanBoardProps {
  initialScripts: ScriptWithClient[];
  onConnectionChange?: (connected: boolean) => void;
  refreshKey?: number;
  onArchive?: (id: string, archived: boolean) => void;
  activeClientId?: string | null;
}

export default function KanbanBoard({ initialScripts, onConnectionChange, refreshKey, onArchive, activeClientId }: KanbanBoardProps) {
  const [scripts, setScripts] = useState<ScriptWithClient[]>(initialScripts);
  const [renderKey, setRenderKey] = useState(0);
  void renderKey;
  const [selectedScript, setSelectedScript] = useState<ScriptWithClient | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [undoToast, setUndoToast] = useState<{ scriptId: string; oldStatus: ScriptStatus; newStatus: ScriptStatus; colLabel: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subscribedRef = useRef(false);

  const handleStatusChange = useCallback((scriptId: string, newStatus: ScriptStatus) => {
    setScripts((prev) => prev.map((s) => (s.id === scriptId ? { ...s, status: newStatus } : s)));
    setSelectedScript((prev) => prev && prev.id === scriptId ? { ...prev, status: newStatus } : prev);
  }, []);

  useEffect(() => { setScripts(initialScripts); }, [initialScripts]);

  const fetchScripts = useCallback(async () => {
    try {
      const res = await fetch("/api/scripts?limit=200");
      if (res.ok) {
        const json = await res.json();
        // Support both paginated { data } and legacy array responses
        const scripts = Array.isArray(json) ? json : json.data;
        if (scripts) setScripts(scripts as ScriptWithClient[]);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) fetchScripts();
  }, [refreshKey, fetchScripts]);

  const handleScriptChange = useCallback(
    (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
      const updated = payload.new as unknown as Script;
      setScripts((prev) => {
        if (payload.eventType === "DELETE") return prev.filter((s) => s.id !== (payload.old as { id: string }).id);
        const idx = prev.findIndex((s) => s.id === updated.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], ...updated }; return next; }
        if (payload.eventType === "INSERT") fetchScripts();
        return prev;
      });
    },
    [fetchScripts]
  );

  useEffect(() => {
    const supabase = createClient();
    // Scope realtime subscription to the active client filter when set
    const filter = activeClientId
      ? { event: "*" as const, schema: "public", table: "scripts", filter: `client_id=eq.${activeClientId}` }
      : { event: "*" as const, schema: "public", table: "scripts" };
    const channel = supabase
      .channel(`scripts-realtime-${activeClientId ?? "all"}`)
      .on("postgres_changes", filter, handleScriptChange)
      .subscribe((status: string) => {
        const isSubscribed = status === "SUBSCRIBED";
        subscribedRef.current = isSubscribed;
        onConnectionChange?.(isSubscribed);
        if (!isSubscribed && !pollingRef.current) pollingRef.current = setInterval(fetchScripts, 10_000);
        if (isSubscribed && pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      });
    return () => {
      supabase.removeChannel(channel);
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [handleScriptChange, onConnectionChange, fetchScripts, activeClientId]);

  useEffect(() => {
    const interval = setInterval(() => setRenderKey((k) => k + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const [agentScript, setAgentScript] = useState<{ id: string; title: string; client_name: string; due_date: string | null } | null>(null);

  const handleArchive = useCallback((id: string, archived: boolean) => {
    setScripts((prev) => prev.map((s) => s.id === id ? { ...s, archived } : s));
    onArchive?.(id, archived);
  }, [onArchive]);

  const visibleScripts = scripts.filter((s) => !s.archived && s.status !== "closed");

  const grouped = columns.reduce<Record<ColumnKey, ScriptWithClient[]>>(
    (acc, col) => { acc[col.key] = []; return acc; },
    {} as Record<ColumnKey, ScriptWithClient[]>
  );
  for (const script of visibleScripts) {
    const col = categorizeScript(script);
    if (col) grouped[col].push(script);
  }

  const onDragStart = useCallback(() => setIsDragging(true), []);

  const handleUndo = useCallback(async (scriptId: string, oldStatus: ScriptStatus) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast(null);
    handleStatusChange(scriptId, oldStatus);
    try {
      await fetch(`/api/scripts/${scriptId}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: oldStatus }),
      });
    } catch { /* silent — optimistic already reverted */ }
  }, [handleStatusChange]);

  const onDragEnd = useCallback(async (result: DropResult) => {
    setIsDragging(false);
    if (!result.destination) return;
    const destCol = result.destination.droppableId as ColumnKey;
    const newStatus = columnToStatus[destCol];
    if (!newStatus) return;

    const scriptId = result.draggableId;
    const script = visibleScripts.find((s) => s.id === scriptId);
    if (!script) return;

    const oldStatus = script.status;
    if (categorizeScript({ ...script, status: newStatus }) === categorizeScript(script)) return;

    handleStatusChange(scriptId, newStatus);

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const colLabel = columns.find((c) => c.key === destCol)?.label ?? destCol;
    setUndoToast({ scriptId, oldStatus, newStatus, colLabel });
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 4000);

    try {
      const res = await fetch(`/api/scripts/${scriptId}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) handleStatusChange(scriptId, oldStatus);
    } catch {
      handleStatusChange(scriptId, oldStatus);
    }
  }, [visibleScripts, handleStatusChange]);

  const emptyIcons: Record<string, React.ReactNode> = {
    draft: <FileEdit size={14} className="text-[var(--muted)] opacity-40" />,
    pending_review: <Upload size={14} className="text-[var(--muted)] opacity-40" />,
  };

  const emptyLabels: Record<string, string> = {
    draft: "No drafts",
    pending_review: "No pending scripts",
  };

  return (
    <>
      <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex flex-col md:flex-row gap-4 md:min-w-max">
          {columns.map((col) => (
            <div key={col.key} className="flex flex-col w-full md:w-[280px] md:shrink-0">
              <div className="flex items-center gap-2.5 mb-3 px-1">
                <div className="w-1.5 h-1.5 rounded-sm bg-[var(--muted)] opacity-40" />
                <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--muted)]">{col.label}</h2>
                <span className="ml-auto text-[10px] text-[var(--muted)] opacity-60 bg-[var(--surface-elevated)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                  {grouped[col.key].length}
                </span>
              </div>

              <Droppable droppableId={col.key} isDropDisabled={col.key === "overdue"}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex flex-col gap-2 min-h-[200px] rounded-lg p-2 border transition-colors ${
                      snapshot.isDraggingOver && col.key !== "overdue"
                        ? "bg-[var(--accent-primary)]/5 border-[var(--accent-primary)]/30"
                        : "bg-[var(--bg)]/50 border-[var(--border)]/50"
                    }`}
                  >
                    <AnimatePresence mode="popLayout">
                      {grouped[col.key].length === 0 && !snapshot.isDraggingOver ? (
                        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-[var(--border)] rounded-lg min-h-[200px] gap-2">
                          {emptyIcons[col.key] || <Plus size={14} className="text-[var(--muted)] opacity-40" />}
                          <p className="text-[11px] text-[var(--muted)] opacity-40">
                            {emptyLabels[col.key] || "No scripts here"}
                          </p>
                          {col.key === "overdue" && (
                            <p className="text-[9px] text-[var(--muted)] opacity-30 flex items-center gap-1">
                              <Search size={8} /> Auto-detected
                            </p>
                          )}
                        </div>
                      ) : (
                        grouped[col.key].map((script, index) => (
                          <Draggable key={script.id} draggableId={script.id} index={index}>
                            {(dragProvided) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                              >
                                <ScriptCard
                                  script={script}
                                  onClick={() => setSelectedScript(script)}
                                  onArchive={handleArchive}
                                  onStatusChange={handleStatusChange}
                                  onRunAgent={(s) => setAgentScript(s)}
                                  dragHandleProps={dragProvided.dragHandleProps}
                                  disableLayoutAnimation={isDragging}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                    </AnimatePresence>
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      <AnimatePresence>
        {selectedScript && (
          <ScriptDetailSheet
            script={selectedScript}
            onClose={() => setSelectedScript(null)}
            onStatusChange={handleStatusChange}
            onScriptUpdated={fetchScripts}
          />
        )}
      </AnimatePresence>

      {agentScript && (
        <RunAgentButton
          scripts={[]}
          mode="single"
          singleScript={agentScript}
          onOpenChange={(open) => { if (!open) setAgentScript(null); }}
          key={agentScript.id}
        />
      )}

      <AnimatePresence>
        {undoToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-[60] flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--card)] border border-[var(--border)] shadow-lg text-sm"
          >
            <span className="text-[var(--text)]">Moved to {undoToast.colLabel}</span>
            <button
              onClick={() => handleUndo(undoToast.scriptId, undoToast.oldStatus)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-primary)] hover:opacity-80"
            >
              <Undo2 size={12} />
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
