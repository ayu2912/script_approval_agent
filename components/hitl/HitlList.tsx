"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import ChaserCard from "./ChaserCard";
import ToastProvider from "@/components/ui/ToastProvider";
import type { ChaserData } from "@/app/hitl/page";

interface HitlListProps {
  initialChasers: ChaserData[];
  memories: Record<string, { content: string; memory_type: string; created_at: string }[]>;
}

type FilterKey = "all" | "pending" | "saved" | "rejected";

const FILTER_PILLS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "saved", label: "Saved" },
  { key: "rejected", label: "Rejected" },
];

function getHoursOverdue(chaser: ChaserData): number {
  if (chaser.hitl_state?.hours_overdue != null) {
    return chaser.hitl_state.hours_overdue;
  }
  if (chaser.script.sent_at) {
    return (Date.now() - new Date(chaser.script.sent_at).getTime()) / 3600000;
  }
  return 0;
}

function getUrgencyColor(hoursOverdue: number): string {
  if (hoursOverdue >= 168) return "bg-red-500";       // 7+ days
  if (hoursOverdue >= 72) return "bg-orange-500";      // 3-7 days
  if (hoursOverdue >= 24) return "bg-amber-400";       // 24-72hrs
  return "bg-gray-400";                                // < 24hrs
}

function matchesFilter(chaser: ChaserData, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "pending") return chaser.status === "pending_hitl";
  if (filter === "saved") return chaser.status === "draft_saved";
  if (filter === "rejected") return chaser.status === "rejected";
  return true;
}

export default function HitlList({ initialChasers, memories }: HitlListProps) {
  const [chasers, setChasers] = useState(initialChasers);
  const [selectedId, setSelectedId] = useState<string | null>(chasers[0]?.id ?? null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const router = useRouter();

  const filtered = useMemo(
    () => chasers.filter((c) => matchesFilter(c, filter)),
    [chasers, filter]
  );

  function handleSelectNext() {
    const idx = filtered.findIndex((c) => c.id === selectedId);
    if (idx >= 0 && idx < filtered.length - 1) {
      setSelectedId(filtered[idx + 1].id);
    }
  }

  function handleSelectPrev() {
    const idx = filtered.findIndex((c) => c.id === selectedId);
    if (idx > 0) {
      setSelectedId(filtered[idx - 1].id);
    }
  }

  function handleActionComplete(id: string) {
    setChasers((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null);
      }
      return next;
    });
    router.refresh();
  }

  if (chasers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-12 h-12 rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] flex items-center justify-center mb-4">
          <Bot size={20} className="text-[var(--muted)]" />
        </div>
        <p className="text-[13px] text-[var(--muted)] mb-1">No drafts pending approval</p>
        <p className="text-[11px] text-[var(--muted)] opacity-60 text-center max-w-xs">
          Run the agent on an overdue script to generate a chase draft
        </p>
      </div>
    );
  }

  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  return (
    <ToastProvider>
      <div className="flex flex-col md:flex-row min-h-[600px]">
        <div className="w-full md:w-[240px] md:shrink-0 border-b md:border-b-0 md:border-r border-[var(--border)] flex flex-col">
          <div className="px-3 py-3 border-b border-[var(--border)] flex flex-wrap gap-1.5">
            {FILTER_PILLS.map((pill) => {
              const count = pill.key === "all"
                ? chasers.length
                : chasers.filter((c) => matchesFilter(c, pill.key)).length;
              return (
                <button
                  key={pill.key}
                  onClick={() => setFilter(pill.key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                    filter === pill.key
                      ? "bg-[var(--accent-primary)] text-white"
                      : "bg-[var(--surface-elevated)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {pill.label}
                  {count > 0 && (
                    <span className={`ml-1 ${filter === pill.key ? "opacity-80" : "opacity-50"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto py-1 max-h-[200px] md:max-h-none">
            {filtered.length === 0 && (
              <p className="text-[11px] text-[var(--muted)] opacity-50 px-3 py-6 text-center">
                No items match this filter
              </p>
            )}
            {filtered.map((chaser) => {
              const isActive = selected && chaser.id === selected.id;
              const hoursOverdue = getHoursOverdue(chaser);
              const urgencyColor = getUrgencyColor(hoursOverdue);
              return (
                <button
                  key={chaser.id}
                  onClick={() => setSelectedId(chaser.id)}
                  className={`w-full text-left flex transition-colors ${
                    isActive
                      ? "bg-[var(--surface-elevated)]"
                      : "hover:bg-[var(--surface-elevated)]/50"
                  }`}
                >
                  <div className={`w-[3px] shrink-0 ${urgencyColor}`} />
                  <div className="flex-1 px-3 py-2.5 min-w-0">
                    <p className={`text-[13px] font-medium truncate ${isActive ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>
                      {chaser.script.title}
                    </p>
                    <p className="text-[11px] text-[var(--muted)] opacity-60 truncate mt-0.5">
                      {chaser.client.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {selected ? (
            <ChaserCard
              key={selected.id}
              chaser={selected}
              memories={memories[selected.client_id] ?? []}
              onActionComplete={() => handleActionComplete(selected.id)}
              onSelectNext={handleSelectNext}
              onSelectPrev={handleSelectPrev}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-[13px] text-[var(--muted)] opacity-50">Select an item from the queue</p>
            </div>
          )}
        </div>
      </div>
    </ToastProvider>
  );
}
