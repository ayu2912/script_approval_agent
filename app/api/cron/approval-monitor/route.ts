import { NextRequest, NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { resumeApprovalFlow } from "@/lib/agent/approvalGraph";
import type { ResumeAction } from "@/lib/agent/approvalTypes";

// GET /api/cron/approval-monitor
// Vercel Cron calls this every hour
// Checks all active approval threads and sends follow-ups or escalations based on time elapsed
export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorised calls
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClientDirect() as any;

  // Fetch all threads that are still waiting for a response and not paused
  const { data: activeThreads, error } = await supabase
    .from("approval_threads")
    .select(
      "id, script_id, client_id, status, langgraph_thread_id, " +
      "request_sent_at, follow_up_1_sent_at, follow_up_2_sent_at, " +
      "follow_up_count, is_paused"
    )
    .in("status", ["request_sent", "follow_up_1_sent", "follow_up_2_sent"])
    .eq("is_paused", false)
    .not("langgraph_thread_id", "is", null);

  if (error) {
    console.error("[approval-monitor] Failed to fetch threads:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!activeThreads || activeThreads.length === 0) {
    return NextResponse.json({ processed: 0, message: "No active threads" });
  }

  const now = Date.now();
  const HOUR = 60 * 60 * 1000;

  const results: { threadId: string; action: string; success: boolean }[] = [];

  for (const thread of activeThreads) {
    const threadId: string = thread.langgraph_thread_id;

    // Determine how much time has elapsed since the last send
    let lastSentAt: string | null = null;

    if (thread.status === "request_sent") {
      lastSentAt = thread.request_sent_at;
    } else if (thread.status === "follow_up_1_sent") {
      lastSentAt = thread.follow_up_1_sent_at;
    } else if (thread.status === "follow_up_2_sent") {
      lastSentAt = thread.follow_up_2_sent_at;
    }

    if (!lastSentAt) continue;

    const elapsedHours = (now - new Date(lastSentAt).getTime()) / HOUR;

    let action: ResumeAction | null = null;

    // Escalate after 72h total (follow_up_count >= 2 and another 24h passed)
    if (
      thread.status === "follow_up_2_sent" &&
      thread.follow_up_count >= 2 &&
      elapsedHours >= 24
    ) {
      action = "escalate";
    }
    // Second follow-up: 24h after first follow-up
    else if (
      thread.status === "follow_up_1_sent" &&
      thread.follow_up_count >= 1 &&
      elapsedHours >= 24
    ) {
      action = "follow_up_2";
    }
    // First follow-up: 24h after initial request
    else if (thread.status === "request_sent" && elapsedHours >= 24) {
      action = "follow_up_1";
    }

    if (!action) continue; // Not enough time has passed yet

    const result = await resumeApprovalFlow(threadId, action);
    results.push({ threadId, action, success: result.success });

    if (!result.success) {
      console.error(
        `[approval-monitor] Failed to resume ${threadId} with action ${action}:`,
        result.error
      );
    }

    // Small delay between calls to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  const processed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(
    `[approval-monitor] Processed ${processed}/${results.length} threads. Failed: ${failed}`
  );

  return NextResponse.json({
    processed,
    failed,
    total_checked: activeThreads.length,
    actions: results,
  });
}
