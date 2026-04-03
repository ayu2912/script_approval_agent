import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

interface SendWelcomeEmailParams {
  to: string;
  clientName: string;
  company: string | null;
  accountManager: string | null;
}

export async function sendWelcomeEmail({
  to,
  clientName,
  company,
  accountManager,
}: SendWelcomeEmailParams): Promise<{ success: boolean; error?: string }> {
  const fromEmail = process.env.RESEND_FROM_EMAIL || "greenlit@ruskaruma.me";
  const subject = `Welcome to Scrollhouse${company ? `, ${company}` : ""}`;

  const managerLine = accountManager
    ? `<p style="margin:0 0 16px 0;font-size:14px;color:#a1a1aa;line-height:1.7;">Your account manager is <strong style="color:#ffffff;">${accountManager}</strong>. They will be your main point of contact for everything content-related.</p>`
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
                Welcome aboard, ${clientName}
              </h1>
              <p style="margin:0 0 16px 0;font-size:14px;color:#a1a1aa;line-height:1.7;">
                We are excited to start working with you${company ? ` at ${company}` : ""}. Scrollhouse will be handling your content strategy, production, and distribution.
              </p>
              ${managerLine}
              <p style="margin:0 0 16px 0;font-size:14px;color:#a1a1aa;line-height:1.7;">
                Here is how the approval process works:
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">
                <tr>
                  <td style="padding:8px 0;font-size:14px;color:#a1a1aa;line-height:1.7;">
                    <span style="color:#F97316;font-weight:600;">1.</span> We write scripts and send them to you for review.
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:14px;color:#a1a1aa;line-height:1.7;">
                    <span style="color:#F97316;font-weight:600;">2.</span> You approve, reject, or request changes via email or WhatsApp.
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:14px;color:#a1a1aa;line-height:1.7;">
                    <span style="color:#F97316;font-weight:600;">3.</span> Once approved, we produce and publish the content.
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:14px;color:#a1a1aa;line-height:1.7;">
                    <span style="color:#F97316;font-weight:600;">4.</span> You receive performance reports with data and recommendations.
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:14px;color:#a1a1aa;line-height:1.7;">
                You will receive your first script for review soon. If you have any questions, reply to this email.
              </p>
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
    console.log(`[welcome-email-mock] To: ${to}, Subject: ${subject}`);
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
      console.error("[welcome-email] Resend error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    console.error("[welcome-email] Failed:", message);
    return { success: false, error: message };
  }
}
