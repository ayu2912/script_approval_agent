import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function parseDraftContent(
  draftContent: string,
  fallbackSubject: string
): { subject: string; body: string } {
  const subjectMatch = draftContent.match(/^SUBJECT:\s*(.+)/m);
  const bodyMatch = draftContent.match(/^BODY:\s*([\s\S]*)/m);
  const subject = subjectMatch ? subjectMatch[1].trim() : fallbackSubject;
  const body = bodyMatch ? bodyMatch[1].trim() : draftContent;
  return { subject, body };
}

export async function sendChaserEmail(
  to: string,
  draftContent: string,
  fallbackSubject: string,
  clientName: string,
  reviewUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const fromEmail = process.env.RESEND_FROM_EMAIL || "greenlit@ruskaruma.me";
  const { subject, body } = parseDraftContent(draftContent, fallbackSubject);

  const reviewButton = reviewUrl
    ? `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td style="background-color:#F97316;border-radius:8px;">
            <a href="${reviewUrl}" target="_blank" style="display:inline-block;padding:12px 32px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
              Review Script
            </a>
          </td>
        </tr>
      </table>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0A0A0A;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0A;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#111111;border-radius:12px;border:1px solid #222222;overflow:hidden;">
          <tr>
            <td style="padding:40px 40px 32px 40px;">
              <p style="margin:0 0 4px 0;font-size:13px;color:#F97316;font-weight:600;letter-spacing:0.5px;">GREENLIT</p>
              <h1 style="margin:0 0 24px 0;font-size:20px;color:#ffffff;font-weight:600;line-height:1.3;">
                ${subject}
              </h1>
              <p style="margin:0 0 8px 0;font-size:15px;color:#a1a1aa;line-height:1.7;">
                Hi ${clientName},
              </p>
              <div style="font-size:15px;color:#a1a1aa;line-height:1.7;white-space:pre-wrap;">${body}</div>
              ${reviewButton}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #222222;">
              <p style="margin:0;font-size:11px;color:#3f3f46;">
                Greenlit for Scrollhouse &middot; by ruskaruma
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  if (!resend) {
    console.log(`[chaser-mock] To: ${to}, Subject: ${subject}`);
    return { success: true };
  }

  try {
    const { error } = await resend.emails.send({
      from: `Greenlit <${fromEmail}>`,
      to: [to],
      subject,
      html,
    });
    if (error) {
      console.error("[chaser-email] Resend error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    console.error("[chaser-email] Failed:", message);
    return { success: false, error: message };
  }
}
