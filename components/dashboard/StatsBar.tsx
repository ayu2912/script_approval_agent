"use client";

import { FileText, Eye, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface StatsBarProps {
  active: number;
  inReview: number;
  overdue: number;
  approvedThisWeek: number;
  avgResponseHours: number | null;
}

const cards = [
  { key: "active", label: "Active Scripts", icon: FileText },
  { key: "inReview", label: "In Review", icon: Eye },
  { key: "overdue", label: "Overdue", icon: AlertTriangle },
  { key: "approvedThisWeek", label: "Approved (7d)", icon: CheckCircle },
  { key: "avgResponseHours", label: "Avg Response", icon: Clock },
] as const;

export default function StatsBar({ active, inReview, overdue, approvedThisWeek, avgResponseHours }: StatsBarProps) {
  const values: Record<string, string> = {
    active: String(active),
    inReview: String(inReview),
    overdue: String(overdue),
    approvedThisWeek: String(approvedThisWeek),
    avgResponseHours: avgResponseHours !== null ? `${Math.round(avgResponseHours)}h` : "—",
  };

  return (
    <div className="flex gap-3 px-6 py-3 border-b border-[var(--border)] overflow-x-auto">
      {cards.map(({ key, label, icon: Icon }) => (
        <div
          key={key}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] min-w-[160px]"
        >
          <Icon size={14} className={key === "overdue" && overdue > 0 ? "text-red-400" : "text-[var(--muted)]"} />
          <div>
            <p className={`text-lg font-semibold leading-none ${key === "overdue" && overdue > 0 ? "text-red-400" : "text-[var(--text)]"}`}>
              {values[key]}
            </p>
            <p className="text-[10px] text-[var(--muted)] mt-0.5">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
