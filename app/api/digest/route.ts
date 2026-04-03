import { NextResponse } from "next/server";
import { Resend } from "resend";
import twilio from "twilio";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { isOverdue } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

interface ScriptRow {
  id: string;
  title: string;
  status: string;
  sent_at: string | null;
  due_date: string | null;
  response_deadline_minutes: number;
  client_feedback: string | null;
  reviewed_at: string | null;
  updated_at: string;
  clients: { name: string } | null;
}

interface ChaserRow {
  script_id: string;
  status: string;
  scripts: { title: string } | null;
  clients: { name: string } | null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase: SupabaseAny = createServiceClientDirect();

  try {
const { data: allScripts } = await supabase
      .from("scripts")
      .select("id, title, status, sent_at, due_date, response_deadline_minutes, client_feedback, reviewed_at, updated_at, clients(name)")
      .not("status", "in", '("closed","draft")')
      .eq("archived", false)
      .order("sent_at", { ascending: true });

    const scripts: ScriptRow[] = (allScripts ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      clients: r.clients as ScriptRow["clients"],
    }));

    const overdueList: { title: string; clientName: string; daysOverdue: number }[] = [];
    const pendingReviewList: { title: string; clientName: string }[] = [];

    for (const s of scripts) {
      const clientName = s.clients?.name ?? "Unknown";

      if (s.status === "overdue" || (s.status === "pending_review" && isOverdue(s.sent_at, s.status, s.response_deadline_minutes))) {
        const days = s.sent_at
          ? Math.round((Date.now() - new Date(s.sent_at).getTime()) / 86400000)
          : 0;
        overdueList.push({ title: s.title, clientName, daysOverdue: days });
      } else if (s.status === "pending_review") {
        pendingReviewList.push({ title: s.title, clientName });
      }
    }

overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue);

const { data: pendingChasers } = await supabase
      .from("chasers")
      .select("script_id, status, scripts(title), clients(name)")
      .in("status", ["pending_hitl", "draft_saved"]);

    const hitlItems: { title: string; clientName: string }[] = [];
    if (pendingChasers) {
      for (const c of pendingChasers as ChaserRow[]) {
        hitlItems.push({
          title: c.scripts?.title ?? "Unknown script",
          clientName: c.clients?.name ?? "Unknown",
        });
      }
    }

const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const wins: { title: string; clientName: string }[] = [];
    for (const s of scripts) {
      if (s.status === "approved" && s.reviewed_at && s.reviewed_at >= yesterday) {
        wins.push({ title: s.title, clientName: s.clients?.name ?? "Unknown" });
      }
    }

const nowMs = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const deadlines: { title: string; clientName: string; daysUntil: number }[] = [];
    for (const s of scripts) {
      if (s.due_date && s.status !== "approved" && s.status !== "rejected") {
        const dueMs = new Date(s.due_date).getTime();
        const daysUntil = Math.round((dueMs - nowMs) / 86400000);
        if (daysUntil > 0 && daysUntil <= 7) {
          deadlines.push({ title: s.title, clientName: s.clients?.name ?? "Unknown", daysUntil });
        }
      }
    }
    deadlines.sort((a, b) => a.daysUntil - b.daysUntil);

    const needsAction = hitlItems.length > 0 || overdueList.length > 0 || deadlines.length > 0;
    const lines: string[] = ["Good morning. Here's your Greenlit summary:\n"];

    if (hitlItems.length > 0) {
      lines.push(`NEEDS ACTION (${hitlItems.length}):`);
      for (const item of hitlItems) {
        lines.push(`- ${item.title} — chaser draft waiting your approval (${item.clientName})`);
      }
      lines.push("");
    }

    if (overdueList.length > 0) {
      lines.push(`OVERDUE (${overdueList.length}):`);
      for (const item of overdueList) {
        lines.push(`- ${item.title} — ${item.daysOverdue} day${item.daysOverdue !== 1 ? "s" : ""} no response (${item.clientName})`);
      }
      lines.push("");
    }

    if (pendingReviewList.length > 0) {
      lines.push(`IN REVIEW (${pendingReviewList.length}):`);
      for (const item of pendingReviewList) {
        lines.push(`- ${item.title} (${item.clientName})`);
      }
      lines.push("");
    }

    if (wins.length > 0) {
      lines.push("WINS YESTERDAY:");
      for (const w of wins) {
        lines.push(`- ${w.title} approved (${w.clientName})`);
      }
      lines.push("");
    }

    if (deadlines.length > 0) {
      lines.push("UPCOMING DEADLINES:");
      for (const d of deadlines) {
        lines.push(`- ${d.title} due in ${d.daysUntil} day${d.daysUntil !== 1 ? "s" : ""} (${d.clientName})`);
      }
      lines.push("");
    }

    if (!needsAction && wins.length === 0 && pendingReviewList.length === 0) {
      lines.length = 0;
      lines.push("Good morning. All clear — nothing needs your attention today.");
    }

    const digestText = lines.join("\n");

    const teamEmail = process.env.TEAM_EMAIL;
    if (teamEmail && resend) {
      try {
        await resend.emails.send({
          from: `Greenlit <${process.env.RESEND_FROM_EMAIL || "greenlit@ruskaruma.me"}>`,
          to: [teamEmail],
          subject: needsAction
            ? `[Greenlit] Morning digest — ${hitlItems.length + overdueList.length} need attention`
            : "[Greenlit] Morning digest — all clear",
          text: digestText,
        });
        console.log("[digest] Email sent to", teamEmail);
      } catch (err) {
        console.error("[digest] Email failed:", err);
      }
    }

    const founderWhatsApp = process.env.FOUNDER_WHATSAPP || process.env.DEMO_WHATSAPP_NUMBER;
    if (founderWhatsApp) {
      const from = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
      const to = founderWhatsApp.startsWith("whatsapp:") ? founderWhatsApp : `whatsapp:${founderWhatsApp}`;

      if (twilioClient) {
        try {
          await twilioClient.messages.create({ from, to, body: digestText });
          console.log("[digest] WhatsApp sent to", founderWhatsApp);
        } catch (err) {
          console.error("[digest] WhatsApp failed:", err);
        }
      } else {
        console.log(`[digest-mock] WhatsApp to ${to}: ${digestText}`);
      }
    }

    await supabase.from("audit_log").insert({
      entity_type: "system",
      entity_id: "digest",
      action: "daily_digest_sent",
      actor: "cron",
      metadata: {
        overdue: overdueList.length,
        hitl_pending: hitlItems.length,
        wins: wins.length,
        deadlines: deadlines.length,
        pending_review: pendingReviewList.length,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    try {
      const agentRes = await fetch(`${appUrl}/api/agent/run`, {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      const agentData = await agentRes.json();
      console.log("[digest] Chained agent/run result:", agentData);
    } catch (err) {
      console.error("[digest] Chained agent/run failed:", err);
    }

    return NextResponse.json({
      success: true,
      overdue: overdueList.length,
      hitl_pending: hitlItems.length,
      wins: wins.length,
      deadlines: deadlines.length,
      pending_review: pendingReviewList.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Digest failed";
    console.error("[digest] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
