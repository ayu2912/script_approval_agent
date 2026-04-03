"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

interface Notification {
  id: string;
  type: "chaser" | "feedback";
  title: string;
  message: string;
  link: string;
  created_at: string;
}

const LS_KEY = "greenlit_last_seen_at";

export default function NotificationBell({ collapsed }: { collapsed: boolean }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    const since = localStorage.getItem(LS_KEY) || new Date(0).toISOString();
    try {
      const res = await fetch(`/api/notifications?since=${encodeURIComponent(since)}`);
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications?.slice(0, 5) ?? []);
      setUnreadCount(data.total_unread ?? 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      localStorage.setItem(LS_KEY, new Date().toISOString());
      setUnreadCount(0);
    }
  };

  return (
    <div ref={ref} className={`relative ${collapsed ? "flex justify-center" : ""}`}>
      <button onClick={toggle} className="relative text-[var(--muted)] hover:text-[var(--text)] p-1">
        <Bell size={14} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center leading-none">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--text)]">Notifications</span>
            {unreadCount > 0 && <span className="text-[10px] text-[var(--muted)]">{unreadCount} new</span>}
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-[var(--muted)] text-center">No notifications yet</p>
            ) : (
              items.map((item) => (
                <Link key={item.id} href={item.link} className="block px-3 py-2.5 hover:bg-[var(--surface-elevated)] border-b border-[var(--border)] last:border-0">
                  <p className="text-xs text-[var(--text)] font-medium truncate">{item.title}</p>
                  <p className="text-[11px] text-[var(--muted)] truncate mt-0.5">{item.message}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
