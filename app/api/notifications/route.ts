import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";

type SupabaseAny = any;

interface Notification {
  id: string;
  type: "chaser" | "feedback";
  title: string;
  message: string;
  link: string;
  created_at: string;
}

export async function GET(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const url = new URL(request.url);
  const since = url.searchParams.get("since") || new Date(0).toISOString();
  const supabase = createServiceClientDirect();
  const notifications: Notification[] = [];

  const { data: chasers } = await (supabase as SupabaseAny)
    .from("chasers")
    .select("id, created_at, script:scripts(id, title, client:clients(name))")
    .eq("status", "pending_hitl")
    .order("created_at", { ascending: false })
    .limit(5);

  if (chasers) {
    for (const c of chasers) {
      notifications.push({
        id: `chaser-${c.id}`,
        type: "chaser",
        title: `Chaser needs approval`,
        message: `${c.script?.client?.name ?? "Client"} — ${c.script?.title ?? "Untitled"}`,
        link: "/hitl",
        created_at: c.created_at,
      });
    }
  }

  const { data: feedback } = await (supabase as SupabaseAny)
    .from("scripts")
    .select("id, title, reviewed_at, client_feedback, client:clients(name)")
    .not("client_feedback", "is", null)
    .gte("reviewed_at", since)
    .order("reviewed_at", { ascending: false })
    .limit(5);

  if (feedback) {
    for (const f of feedback) {
      notifications.push({
        id: `feedback-${f.id}`,
        type: "feedback",
        title: `New feedback received`,
        message: `${f.client?.name ?? "Client"} — ${f.title ?? "Untitled"}`,
        link: `/dashboard`,
        created_at: f.reviewed_at,
      });
    }
  }

  notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalUnread = notifications.filter((n) => new Date(n.created_at) > new Date(since)).length;

  return NextResponse.json({ notifications: notifications.slice(0, 5), total_unread: totalUnread });
}
