import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { storeClientMemory, buildClientResponseMemory } from "@/lib/agent/nodes/memoryUpdate";
import { notifyTeam } from "@/lib/notifications/notifyTeam";
import { isRateLimited } from "@/lib/rateLimit";
import { sanitizeFeedback } from "@/lib/validation";
import type { ScriptStatus } from "@/lib/supabase/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

function extractIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = extractIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { token } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data, error } = await supabase
    .from("scripts")
    .select("*, client:clients(name, company)")
    .eq("review_token", token)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Script not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = extractIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { token } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();
  const body = await request.json();

  const { action, feedback: rawFeedback } = body as {
    action: "approved" | "rejected" | "changes_requested";
    feedback?: string;
  };

  const validActions: ScriptStatus[] = ["approved", "rejected", "changes_requested"];
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: "action must be approved, rejected, or changes_requested" },
      { status: 400 }
    );
  }

  if (rawFeedback !== undefined && typeof rawFeedback !== "string") {
    return NextResponse.json({ error: "feedback must be a string" }, { status: 400 });
  }
  if (typeof rawFeedback === "string" && rawFeedback.length > 10_000) {
    return NextResponse.json({ error: "feedback exceeds 10,000 character limit" }, { status: 400 });
  }

  const feedback = rawFeedback ? sanitizeFeedback(rawFeedback) : null;

  const respondedAt = new Date();

  const { data: updated, error: updateError } = await supabase
    .from("scripts")
    .update({
      status: action,
      client_feedback: feedback,
      reviewed_at: respondedAt.toISOString(),
    })
    .eq("review_token", token)
    .eq("status", "pending_review")
    .select("id, client_id, sent_at")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: "already_reviewed" },
      { status: 409 }
    );
  }

  const script = updated;

  await supabase.from("audit_log").insert({
    entity_type: "script",
    entity_id: script.id,
    action: `client_${action}`,
    actor: `client:${script.client_id}`,
    metadata: { feedback: feedback ?? null, review_token: token },
  });

  const statField =
    action === "approved"
      ? "approved_count"
      : action === "rejected"
        ? "rejected_count"
        : "changes_requested_count";

  const { data: client } = await supabase
    .from("clients")
    .select(`${statField}, avg_response_hours, name`)
    .eq("id", script.client_id)
    .single();

  if (client) {
    const sentAt = script.sent_at ? new Date(script.sent_at) : null;
    const responseHours = sentAt
      ? (respondedAt.getTime() - sentAt.getTime()) / (1000 * 60 * 60)
      : null;

    const alpha = 0.3;
    const oldAvg = client.avg_response_hours ?? 48;
    const newAvg = responseHours !== null
      ? alpha * responseHours + (1 - alpha) * oldAvg
      : oldAvg;

    await supabase.rpc("increment_client_stat", {
      client_id: script.client_id,
      stat_field: statField,
      new_avg_response_hours: newAvg,
    }).then(({ error: rpcError }: { error: { message: string } | null }) => {
      if (rpcError) {
        console.error("[review] RPC increment failed, falling back:", rpcError.message);
        const currentCount = (client as Record<string, number>)[statField] ?? 0;
        supabase
          .from("clients")
          .update({
            [statField]: currentCount + 1,
            avg_response_hours: newAvg,
          })
          .eq("id", script.client_id);
      }
    });
  }

  const { data: scriptForMemory } = await supabase
    .from("scripts")
    .select("title")
    .eq("id", script.id)
    .single();

  if (scriptForMemory) {
    if (client) {
      await notifyTeam({ clientName: client.name, action, scriptTitle: scriptForMemory.title, feedback: feedback ?? null, channel: "both" });
    }

    const sentAt = script.sent_at ? new Date(script.sent_at) : null;
    const respHours = sentAt
      ? (respondedAt.getTime() - sentAt.getTime()) / (1000 * 60 * 60)
      : null;

    storeClientMemory(
      script.client_id,
      buildClientResponseMemory({
        clientName: client.name,
        scriptTitle: scriptForMemory.title,
        intent: action,
        feedback: feedback ?? null,
        responseHours: respHours,
        channel: "email",
      }),
      "client_response",
      { script_id: script.id, review_token: token }
    ).catch((err: unknown) => console.error("[review] Memory storage failed:", err));
  }

  return NextResponse.json({ success: true, status: action });
}
