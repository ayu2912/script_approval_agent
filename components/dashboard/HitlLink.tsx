"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";

export default function HitlLink() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch("/api/hitl/pending-count");
        if (res.ok) {
          const data = await res.json();
          setCount(data.count);
        }
      } catch {
        // Silently fail - non-critical UI element
      }
    }

    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Link
      href="/hitl"
      className="relative flex items-center gap-2 px-3 py-1.5 rounded text-xs text-[var(--muted)] border border-[var(--border)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text)]"
    >
      <Shield size={13} />
      HITL
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-[9px] font-bold text-amber-500 dark:text-amber-400 border border-amber-500/20">
          {count}
        </span>
      )}
    </Link>
  );
}
