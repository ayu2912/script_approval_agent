import { NextRequest, NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { resumeApprovalFlow } from "@/lib/agent/approvalGraph";

// POST /api/webhooks/twilio
// Twilio calls this when a client replies on WhatsApp
// Configure this URL in your Twilio console under WhatsApp → Sandbox Settings → "When a message comes in"
export async function POST(req: NextRequest) {
  // Twilio sends form-encoded body
  const body = await req.text();
  const params = new URLSearchParams(body);

  const from = params.get("From");    // e.g. "whatsapp:+918340121267"
  const messageBody = params.get("Body"); // The client's reply text

  if (!from || !messageBody) {
    return new Response("OK", { status: 200 }); // Always 200 to Twilio
  }

  // Normalise phone number — strip "whatsapp:" prefix
  const phoneNumber = from.replace("whatsapp:", "").trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClientDirect() as any;

  // --- Find the client with this WhatsApp number ---
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .or(`whatsapp_number.eq.${phoneNumber},whatsapp_number.eq.whatsapp:${phoneNumber}`)
    .maybeSingle();

  if (!client) {
    console.warn(`[twilio-webhook] No client found for number: ${phoneNumber}`);
    return new Response("OK", { status: 200 });
  }

  // --- Find the most recent active approval thread for this client ---
  const { data: thread } = await supabase
    .from("approval_threads")
    .select("id, langgraph_thread_id, status, script_id")
    .eq("client_id", client.id)
    .not("status", "in", '("approved","rejected","escalated","call_requested")')
    .eq("is_paused", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!thread || !thread.langgraph_thread_id) {
    console.warn(`[twilio-webhook] No active approval thread for client: ${client.name}`);
    return new Response("OK", { status: 200 });
  }

  // --- Log the incoming response ---
  await supabase.from("audit_log").insert({
    entity_type: "approval_thread",
    entity_id: thread.id,
    action: "client_response_received",
    actor: "twilio_webhook",
    metadata: {
      from: phoneNumber,
      client_name: client.name,
      message_preview: messageBody.slice(0, 100),
      thread_id: thread.langgraph_thread_id,
    },
  });

  // --- Resume the LangGraph graph with the client's response ---
  const result = await resumeApprovalFlow(
    thread.langgraph_thread_id,
    "response",
    messageBody
  );

  if (!result.success) {
    console.error(
      `[twilio-webhook] Failed to resume graph for thread ${thread.langgraph_thread_id}:`,
      result.error
    );
  }

  // Always return 200 to Twilio — never let it retry
  return new Response("OK", { status: 200 });
}
