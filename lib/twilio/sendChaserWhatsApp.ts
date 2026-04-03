import twilio from "twilio";

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

interface SendChaserWhatsAppParams {
  to: string;
  clientName: string;
  draftContent: string;
  subject: string;
}

export async function sendChaserWhatsApp({
  to,
  clientName,
  draftContent,
  subject,
}: SendChaserWhatsAppParams): Promise<{ success: boolean; error?: string }> {
  const from = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
  const toNumber = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

  let body = draftContent;
  const bodyMatch = draftContent.match(/BODY:\s*([\s\S]+)/i);
  if (bodyMatch) {
    body = bodyMatch[1].trim();
  }

  const message = [
    `Re: ${subject}`,
    ``,
    body,
  ].join("\n");

  if (!twilioClient) {
    console.log(`[whatsapp-chaser-mock] To: ${toNumber}, Subject: ${subject}, Body: ${body}`);
    return { success: true };
  }

  try {
    await twilioClient.messages.create({
      from,
      to: toNumber,
      body: message,
    });
    return { success: true };
  } catch (err: unknown) {
    const twilioErr = err as { message?: string };
    const errorMsg = twilioErr.message ?? "WhatsApp chaser send failed";
    console.error("[whatsapp-chaser] Failed:", errorMsg);
    return { success: false, error: errorMsg };
  }
}
