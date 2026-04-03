import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, differenceInHours } from "date-fns";
import type { ScriptStatus } from "@/lib/supabase/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getScriptAge(sentAt: string): number {
  return differenceInHours(new Date(), new Date(sentAt));
}

export function isOverdue(sentAt: string | null, status: ScriptStatus, responseDeadlineMinutes?: number): boolean {
  if (!sentAt) return false;
  if (status === "approved" || status === "rejected" || status === "draft" || status === "closed") return false;
  const deadlineMinutes = responseDeadlineMinutes ?? 2880;
  const deadlineHours = deadlineMinutes / 60;
  return getScriptAge(sentAt) > deadlineHours;
}

export function formatTimeAgo(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function getChaseCountdown(sentAt: string | null, responseDeadlineMinutes?: number): string | null {
  if (!sentAt) return null;
  const deadlineMinutes = responseDeadlineMinutes ?? 2880;
  const sentTime = new Date(sentAt).getTime();
  const deadlineTime = sentTime + deadlineMinutes * 60 * 1000;
  const remainingMs = deadlineTime - Date.now();

  if (remainingMs <= 0) return null;

  const remainingMinutes = Math.round(remainingMs / (60 * 1000));
  if (remainingMinutes < 60) return `Chase in ${remainingMinutes}m`;
  const remainingHours = Math.round(remainingMinutes / 60);
  if (remainingHours < 24) return `Chase in ${remainingHours}h`;
  const remainingDays = Math.round(remainingHours / 24);
  return `Chase in ${remainingDays}d`;
}

export function formatStatus(status: ScriptStatus): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
