import { createServiceClientDirect } from "@/lib/supabase/server";
import type { ApprovalState } from "../../approvalTypes";
import type { NodeLogEntry } from "../../types";

export async function fetchContext(
  state: ApprovalState
): Promise<Partial<ApprovalState>> {
  const start = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClientDirect() as any;

  const { data: script, error } = await supabase
    .from("scripts")
    .select(
      `id, title, content, version, review_token, assigned_writer,
       clients ( id, name, email, whatsapp_number, preferred_channel )`
    )
    .eq("id", state.scriptId)
    .single();

  if (error || !script) {
    return { error: `fetchContext: ${error?.message ?? "Script not found"}` };
  }

  const client = Array.isArray(script.clients)
    ? script.clients[0]
    : script.clients;

  if (!client) {
    return { error: "fetchContext: No client linked to this script" };
  }

  const log: NodeLogEntry = {
    node: "fetchContext",
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: `Fetched "${script.title}" for client "${client.name}"`,
  };

  return {
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.email,
    clientWhatsApp: client.whatsapp_number ?? null,
    preferredChannel:
      (client.preferred_channel as "whatsapp" | "email") ?? "email",
    // Use env fallback for account manager — extend clients table if needed
    accountManagerName: script.assigned_writer ?? "The Scrollhouse Team",
    accountManagerEmail:
      process.env.ALLOWED_EMAIL ??
      process.env.RESEND_FROM_EMAIL ??
      "",
    scriptTitle: script.title,
    scriptContent: script.content ?? "",
    scriptVersion: script.version ?? 1,
    reviewToken: script.review_token ?? null,
    nodeLog: [log],
  };
}
