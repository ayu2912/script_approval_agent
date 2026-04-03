import twilio from "twilio";
import { sendReviewEmail } from "@/lib/resend/sendReviewEmail";
import { createServiceClientDirect } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

const client =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

interface SendWhatsAppParams {
  to: string;
  clientName: string;
  scriptTitle: string;
  reviewUrl: string;
  clientEmail?: string;
  scriptId?: string;
}

export async function sendWhatsApp({
  to,
  clientName,
  scriptTitle,
  reviewUrl,
  clientEmail,
  scriptId,
}: SendWhatsAppParams): Promise<{ success: boolean; error?: string; fallbackUsed?: boolean }> {
  const from = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
  const toNumber = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

  const body = [
    `Hi ${clientName},`,
    ``,
    `A new script "${scriptTitle}" is ready for your review.`,
    ``,
    `Review it here: ${reviewUrl}`,
    ``,
    `Reply to this message:`,
    `APPROVE - to approve`,
    `REJECT - to reject`,
    `Or type your feedback directly.`,
  ].join("\n");

  if (!client) {
    console.log(`[whatsapp-mock] To: ${toNumber}, Body: ${body}`);
    return { success: true };
  }

  try {
    await client.messages.create({
      from,
      to: toNumber,
      body,
    });
    return { success: true };
  } catch (err: unknown) {
    const twilioErr = err as { code?: number; message?: string };
    const message = twilioErr.message ?? "WhatsApp send failed";

    // 63016 = unverified number in Twilio sandbox, must fallback to email
    if (twilioErr.code === 63016) {
      console.warn(`[whatsapp] Sandbox error 63016 for ${to} — falling back to email`);

      if (scriptId) {
        try {
          const supabase: SupabaseAny = createServiceClientDirect();
          await supabase.from("audit_log").insert({
            entity_type: "script",
            entity_id: scriptId,
            action: "whatsapp_sandbox_fallback",
            actor: "system",
            metadata: { phone: to, error_code: 63016 },
          });
        } catch {
          // silent
        }
      }

      if (clientEmail) {
        const emailResult = await sendReviewEmail({
          to: clientEmail,
          clientName,
          scriptTitle,
          reviewUrl,
        });
        if (emailResult.success) {
          return { success: true, fallbackUsed: true };
        }
        return { success: false, error: `WhatsApp blocked (sandbox) and email fallback failed: ${emailResult.error}` };
      }

      return { success: false, error: "WhatsApp blocked (sandbox) and no email address available for fallback" };
    }

    console.error("[whatsapp] Failed:", message);
    return { success: false, error: message };
  }
}
