import { Resend } from "resend";
import type { ReportEntry, AggregateMetrics } from "@/lib/supabase/types";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

interface SendReportEmailParams {
  to: string;
  clientName: string;
  reportTitle: string;
  periodStart: string;
  periodEnd: string;
  entries: ReportEntry[];
  aggregate: AggregateMetrics | null;
  previousAggregate: AggregateMetrics | null;
  overview: string;
  comparison: string;
  recommendations: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtVal(key: string, value: number): string {
  if (key.includes("rate") || key === "ctr") return `${value}%`;
  return value.toLocaleString();
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function changeHtml(current: number, previous: number): string {
  if (current === previous) return '<span style="color:#a1a1aa;">—</span>';
  const pct = previous !== 0 ? Math.round(((current - previous) / previous) * 100) : 0;
  if (current > previous) {
    return `<span style="color:#22c55e;">&#9650; +${pct}%</span>`;
  }
  return `<span style="color:#ef4444;">&#9660; ${pct}%</span>`;
}

export async function sendReportEmail({
  to,
  clientName,
  reportTitle,
  periodStart,
  periodEnd,
  entries,
  aggregate,
  previousAggregate,
  overview,
  comparison,
  recommendations,
}: SendReportEmailParams): Promise<{ success: boolean; error?: string }> {
  const fromEmail = process.env.RESEND_FROM_EMAIL || "greenlit@ruskaruma.me";
  const subject = `${reportTitle} — ${fmtDate(periodStart)} to ${fmtDate(periodEnd)}`;

  const overallMetrics = aggregate?.overall ?? {};
  const prevOverall = previousAggregate?.overall ?? {};
  const hasPrev = Object.keys(prevOverall).length > 0;

  const aggregateRows = Object.entries(overallMetrics)
    .filter(([k]) => k !== "entry_count")
    .map(([key, value]) => {
      const prev = prevOverall[key];
      const changeCol = hasPrev && prev !== undefined
        ? `<td style="padding:6px 12px;font-size:12px;text-align:right;border-bottom:1px solid #222222;">${changeHtml(value, prev)}</td>`
        : "";
      return `<tr>
        <td style="padding:6px 12px;font-size:13px;color:#a1a1aa;border-bottom:1px solid #222222;">${fmtLabel(key)}</td>
        <td style="padding:6px 12px;font-size:13px;color:#ffffff;font-weight:600;text-align:right;border-bottom:1px solid #222222;">${fmtVal(key, value)}</td>
        ${changeCol}
      </tr>`;
    })
    .join("");

  const changeHeader = hasPrev
    ? '<th style="padding:6px 12px;font-size:10px;color:#F97316;text-transform:uppercase;letter-spacing:0.5px;text-align:right;border-bottom:1px solid #222222;">Change</th>'
    : "";

  const entriesHtml = entries
    .map((e) => {
      const topMetrics = Object.entries(e.metrics).slice(0, 3).map(([k, v]) => `${fmtLabel(k)}: ${fmtVal(k, v)}`).join(" &middot; ");
      const link = e.post_url ? `<a href="${escapeHtml(e.post_url)}" target="_blank" style="color:#F97316;text-decoration:none;font-size:12px;"> View &rarr;</a>` : "";
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #222222;">
          <p style="margin:0;font-size:13px;color:#ffffff;font-weight:500;">${escapeHtml(e.title)} ${link}</p>
          <p style="margin:2px 0 0 0;font-size:11px;color:#71717a;">${escapeHtml(e.platform)} ${escapeHtml(e.content_type)} &middot; ${fmtDate(e.post_date)}</p>
          <p style="margin:4px 0 0 0;font-size:12px;color:#a1a1aa;">${topMetrics}</p>
        </td>
      </tr>`;
    })
    .join("");

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
          <!-- Header -->
          <tr>
            <td style="padding:40px 40px 16px 40px;">
              <p style="margin:0 0 4px 0;font-size:13px;color:#F97316;font-weight:600;letter-spacing:0.5px;">GREENLIT</p>
              <h1 style="margin:0 0 4px 0;font-size:20px;color:#ffffff;font-weight:600;line-height:1.3;">${escapeHtml(reportTitle)}</h1>
              <p style="margin:0;font-size:13px;color:#71717a;">${fmtDate(periodStart)} to ${fmtDate(periodEnd)} &middot; ${entries.length} piece${entries.length !== 1 ? "s" : ""} of content</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 24px 40px;">
              <p style="margin:0;font-size:14px;color:#a1a1aa;">Hi ${escapeHtml(clientName)}, here's your content performance summary.</p>
            </td>
          </tr>

          <!-- Aggregate Metrics -->
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1a1a;border-radius:8px;border:1px solid #222222;">
                <tr>
                  <td style="padding:10px 12px;font-size:11px;color:#F97316;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;border-bottom:1px solid #222222;">Overall Performance</td>
                  <th style="padding:6px 12px;font-size:10px;color:#F97316;text-transform:uppercase;letter-spacing:0.5px;text-align:right;border-bottom:1px solid #222222;">Total</th>
                  ${changeHeader}
                </tr>
                ${aggregateRows}
              </table>
            </td>
          </tr>

          <!-- Content Entries -->
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1a1a;border-radius:8px;border:1px solid #222222;">
                <tr>
                  <td style="padding:10px 12px;font-size:11px;color:#F97316;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;border-bottom:1px solid #222222;">Content Breakdown</td>
                </tr>
                ${entriesHtml}
              </table>
            </td>
          </tr>

          <!-- Overview -->
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <p style="margin:0 0 8px 0;font-size:11px;color:#F97316;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Performance Overview</p>
              <p style="margin:0;font-size:14px;color:#a1a1aa;line-height:1.7;">${escapeHtml(overview)}</p>
            </td>
          </tr>

          ${comparison ? `<!-- Comparison -->
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <p style="margin:0 0 8px 0;font-size:11px;color:#F97316;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Period Comparison</p>
              <p style="margin:0;font-size:14px;color:#a1a1aa;line-height:1.7;">${escapeHtml(comparison)}</p>
            </td>
          </tr>` : ""}

          ${recommendations ? `<!-- Recommendations -->
          <tr>
            <td style="padding:0 40px 32px 40px;">
              <p style="margin:0 0 8px 0;font-size:11px;color:#F97316;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Recommendations</p>
              <p style="margin:0;font-size:14px;color:#a1a1aa;line-height:1.7;">${escapeHtml(recommendations)}</p>
            </td>
          </tr>` : ""}

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #222222;">
              <p style="margin:0;font-size:11px;color:#3f3f46;">Greenlit for Scrollhouse &middot; by ruskaruma</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  if (!resend) {
    console.log(`[report-email-mock] To: ${to}, Subject: ${subject}`);
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
      console.error("[report-email] Resend error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    console.error("[report-email] Failed:", message);
    return { success: false, error: message };
  }
}
