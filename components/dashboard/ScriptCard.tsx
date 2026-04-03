"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Clock, Calendar, AlertTriangle, MoreHorizontal, Bot, Archive, ArchiveRestore, XCircle, CheckCircle, Ban, RotateCcw, Loader2, MessageSquare, GripVertical } from "lucide-react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import StatusBadge from "@/components/ui/StatusBadge";
import { cn, formatTimeAgo, isOverdue, getScriptAge, getChaseCountdown } from "@/lib/utils";
import Link from "next/link";
import type { ScriptWithClient, ScriptStatus } from "@/lib/supabase/types";

interface ScriptCardProps {
  script: ScriptWithClient;
  onClick?: () => void;
  onArchive?: (id: string, archived: boolean) => void;
  onStatusChange?: (id: string, status: ScriptStatus) => void;
  onRunAgent?: (script: { id: string; title: string; client_name: string; due_date: string | null }) => void;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  disableLayoutAnimation?: boolean;
}

export default function ScriptCard({ script, onClick, onArchive, onStatusChange, onRunAgent, dragHandleProps, disableLayoutAnimation }: ScriptCardProps) {
  const overdue = isOverdue(script.sent_at, script.status, script.response_deadline_minutes) || script.status === "overdue";
  const displayStatus = overdue ? "overdue" as const : script.status;
  const clientInitial = script.client.name.charAt(0).toUpperCase();
  const noContact = !script.client.email && !script.client.whatsapp_number;
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hoursOverdue = overdue && script.sent_at ? getScriptAge(script.sent_at) : 0;
  const daysOverdue = Math.round(hoursOverdue / 24);
  const isCritical = daysOverdue >= 7;
  const isSevere = daysOverdue >= 3;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function handleAction(action: string, e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpen(false);

    if (action === "run_agent" && onRunAgent) {
      onRunAgent({ id: script.id, title: script.title, client_name: script.client.name, due_date: script.due_date });
      return;
    }

    if (action === "archive" || action === "unarchive") {
      const newArchived = action === "archive";
      setLoading(action);
      setActionError(null);
      try {
        const res = await fetch(`/api/scripts/${script.id}/archive`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: newArchived }),
        });
        if (res.ok) {
          onArchive?.(script.id, newArchived);
        } else {
          setActionError(`Failed to ${action}`);
        }
      } catch {
        setActionError(`Failed to ${action}`);
      } finally { setLoading(null); }
      return;
    }

    const statusMap: Record<string, ScriptStatus> = {
      close: "closed",
      approve: "approved",
      reject: "rejected",
      reopen: "draft",
    };

    const newStatus = statusMap[action];
    if (!newStatus) return;

    setLoading(action);
    setActionError(null);
    try {
      const res = await fetch(`/api/scripts/${script.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        onStatusChange?.(script.id, newStatus);
      } else {
        setActionError(`Failed to ${action}`);
      }
    } catch {
      setActionError(`Failed to ${action}`);
    } finally { setLoading(null); }
  }

  const menuItems: { key: string; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: "run_agent", label: "Run Agent", icon: <Bot size={12} />, show: script.status !== "closed" },
    { key: "archive", label: "Archive", icon: <Archive size={12} />, show: !script.archived },
    { key: "unarchive", label: "Unarchive", icon: <ArchiveRestore size={12} />, show: script.archived },
    { key: "reopen", label: "Reopen", icon: <RotateCcw size={12} />, show: script.status === "closed" },
    { key: "close", label: "Close", icon: <XCircle size={12} />, show: script.status !== "closed" },
    { key: "approve", label: "Mark Approved", icon: <CheckCircle size={12} />, show: script.status !== "approved" && script.status !== "closed" },
    { key: "reject", label: "Mark Rejected", icon: <Ban size={12} />, show: script.status !== "rejected" && script.status !== "closed" },
  ].filter(item => item.show);

  return (
    <motion.div
      layout={!disableLayoutAnimation}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: script.archived ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      whileHover={disableLayoutAnimation ? undefined : { scale: 1.01, borderColor: "var(--accent-primary)" }}
      onClick={onClick}
      className={cn(
        "p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] cursor-pointer",
        overdue && isCritical && "border-l-2 border-l-red-500",
        overdue && isSevere && !isCritical && "border-l-2 border-l-red-500/60",
        overdue && !isSevere && "border-l-2 border-l-amber-500/60",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        {dragHandleProps && (
          <div {...dragHandleProps} className="mt-0.5 cursor-grab active:cursor-grabbing text-[var(--muted)] opacity-30 hover:opacity-70 shrink-0">
            <GripVertical size={14} />
          </div>
        )}
        <div className="flex items-center gap-1.5 min-w-0">
          {overdue && isSevere && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          )}
          <h3 className="text-[14px] font-medium text-[var(--text)] truncate leading-tight">
            {script.title}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {script.status === "escalated" && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-wider">
              Escalated
            </span>
          )}
          {isCritical && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-wider">
              Critical
            </span>
          )}
          {script.quality_score && (
            <span className={cn(
              "text-[9px] font-bold px-1.5 py-0.5 rounded border",
              script.quality_score.average >= 8
                ? "bg-[var(--accent-success)]/10 text-[var(--accent-success)] border-[var(--accent-success)]/25"
                : script.quality_score.average >= 6
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  : "bg-red-500/15 text-red-400 border-red-500/30"
            )}>
              {script.quality_score.average}/10
            </span>
          )}
          <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--muted)]">
            v{script.version}
          </span>
          {script.brief_id && (
            <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400">
              From brief
            </span>
          )}
          <StatusBadge status={displayStatus} />
          <div className="relative" ref={menuRef}>
            {loading ? (
              <Loader2 size={14} className="text-[var(--muted)] animate-spin" />
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                className="p-0.5 rounded text-[var(--muted)] opacity-50 hover:opacity-100 hover:bg-[var(--surface-elevated)]"
              >
                <MoreHorizontal size={14} />
              </button>
            )}
            {menuOpen && (
              <div className="absolute right-0 top-6 z-50 w-44 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl py-1 overflow-hidden">
                {menuItems.map((item) => (
                  <button
                    key={item.key}
                    onClick={(e) => handleAction(item.key, e)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-[var(--muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)] text-left"
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-2">
        <div className="w-5 h-5 rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] flex items-center justify-center text-[10px] font-medium text-[var(--muted)] shrink-0">
          {clientInitial}
        </div>
        <span className="truncate">
          <Link
            href={`/clients/${script.client.id}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:underline"
          >
            {script.client.name}
          </Link>
          {script.client.company && (
            <span className="opacity-60"> / {script.client.company}</span>
          )}
        </span>
        {noContact && (
          <span title="No contact info - delivery will fail">
            <AlertTriangle size={12} className="text-amber-400 shrink-0" />
          </span>
        )}
      </div>

      {script.sent_at && (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] opacity-60">
          <Clock size={11} />
          <span>Sent {formatTimeAgo(script.sent_at)}</span>
        </div>
      )}

      {!script.sent_at && script.created_at && (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] opacity-60">
          <Clock size={11} />
          <span>Created {formatTimeAgo(script.created_at)}</span>
        </div>
      )}

      {script.due_date && (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] opacity-60 mt-1">
          <Calendar size={11} />
          <span>Due {new Date(script.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        </div>
      )}

      {script.client_feedback && (script.status === "changes_requested" || script.status === "rejected" || script.status === "approved") && (
        <div className="flex items-start gap-1.5 text-[11px] mt-1.5">
          <MessageSquare size={10} className="text-amber-400 opacity-70 mt-0.5 shrink-0" />
          <span className="text-[var(--muted)] opacity-80 leading-relaxed line-clamp-2">
            &ldquo;{script.client_feedback}&rdquo;
          </span>
        </div>
      )}

      {!overdue && script.status === "pending_review" && script.sent_at && (() => {
        const countdown = getChaseCountdown(script.sent_at, script.response_deadline_minutes);
        if (!countdown) return null;
        return (
          <div className="flex items-center gap-1.5 text-[11px] mt-1">
            <AlertTriangle size={10} className="text-amber-400 opacity-70" />
            <span className="text-amber-400 opacity-80 font-medium">{countdown}</span>
          </div>
        );
      })()}

      {actionError && (
        <div className="flex items-center gap-1.5 text-[11px] mt-1.5 text-red-400">
          <AlertTriangle size={10} className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}
    </motion.div>
  );
}
