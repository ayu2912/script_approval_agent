import { NextResponse } from "next/server";
import { monitorOverdueScripts } from "@/lib/agent/nodes/monitor";
import { runChaserForScript } from "@/lib/agent/graph";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const overdueScripts = await monitorOverdueScripts();
    const totalOverdue = overdueScripts.length;

    if (totalOverdue === 0) {
      console.log("[cron/overdue] No overdue scripts found");
      return NextResponse.json({ processed: 0, errors: [], total_overdue: 0 });
    }

    console.log(`[cron/overdue] Found ${totalOverdue} overdue scripts`);
    const errors: string[] = [];
    let processed = 0;

    for (const state of overdueScripts) {
      try {
        const result = await runChaserForScript(state);
        if (result.error) {
          errors.push(`${state.scriptId}: ${result.error}`);
        } else {
          processed++;
        }
        console.log(`[cron/overdue] Script ${state.scriptId}: ${result.error ? "failed" : "ok"}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${state.scriptId}: ${msg}`);
        console.error(`[cron/overdue] Script ${state.scriptId} threw:`, msg);
      }
    }

    console.log(`[cron/overdue] Done: ${processed}/${totalOverdue} processed, ${errors.length} errors`);
    return NextResponse.json({ processed, errors, total_overdue: totalOverdue });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cron overdue scan failed";
    console.error("[cron/overdue] Fatal:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
