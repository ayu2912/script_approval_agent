"use client";

export default function SkeletonCard() {
  return (
    <div className="p-4 rounded bg-[var(--card)] border border-[var(--border)] animate-pulse">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="h-4 bg-[var(--surface-elevated)] rounded w-3/4" />
        <div className="h-5 bg-[var(--surface-elevated)] rounded w-16" />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-full bg-[var(--surface-elevated)]" />
        <div className="h-3 bg-[var(--surface-elevated)] rounded w-1/2" />
      </div>
      <div className="h-3 bg-[var(--surface-elevated)] rounded w-1/3" />
    </div>
  );
}
