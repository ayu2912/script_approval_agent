"use client";

import { cn } from "@/lib/utils";
import { formatStatus } from "@/lib/utils";
import { Badge, BadgeDot } from "@/components/ui/badge";
import type { ScriptStatus } from "@/lib/supabase/types";

const statusConfig: Record<ScriptStatus, { variant: "success" | "warning" | "destructive" | "info" | "mono"; dotColor?: string }> = {
  approved: { variant: "success", dotColor: "bg-[var(--accent-success)]" },
  pending_review: { variant: "warning", dotColor: "bg-amber-400" },
  changes_requested: { variant: "warning", dotColor: "bg-amber-400" },
  overdue: { variant: "destructive", dotColor: "bg-red-400" },
  escalated: { variant: "destructive", dotColor: "bg-red-400" },
  rejected: { variant: "destructive", dotColor: "bg-red-400" },
  draft: { variant: "mono" },
  closed: { variant: "mono" },
};

interface StatusBadgeProps {
  status: ScriptStatus;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.draft;
  const isOverdueStatus = status === "overdue";

  return (
    <Badge
      variant={config.variant}
      size="xs"
      className={cn(className)}
    >
      {config.dotColor && (
        <BadgeDot className={config.dotColor} />
      )}
      {formatStatus(status)}
    </Badge>
  );
}
