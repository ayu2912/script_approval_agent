import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { sendChaserEmail } from "@/lib/resend/sendChaserEmail";
import { sendChaserWhatsApp } from "@/lib/twilio/sendChaserWhatsApp";
import { storeClientMemory, buildChaserSentMemory } from "@/lib/agent/nodes/memoryUpdate";
import { resumeChaserGraph } from "@/lib/agent/graph";
import { storeFewShotExample } from "@/lib/agent/fewShot";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();

  let body: { editedContent?: string; saveOnly?: boolean; channel?: "email" | "whatsapp" | "both" };
  try {
    body = await request.json();
  } catch (err) {
    console.error("[hitl/approve] Failed to parse request body:", err);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { editedContent, saveOnly, channel } = body;

  const { data: chaser, error: fetchError } = await supabase
    .from("chasers")
    .select("id, script_id, client_id, draft_content, status, hitl_state, clients(name, email, company), scripts(title, platform, sent_at, review_token)")
    .eq("id", id)
    .single();

  if (fetchError || !chaser) {
    console.error("[hitl/approve] Chaser fetch failed:", fetchError?.message ?? "not found", "id:", id);
    return NextResponse.json({ error: "Chaser not found" }, { status: 404 });
  }

  console.log("[hitl/approve] Chaser", id, "status:", chaser.status, "client:", chaser.clients?.email ?? "no email");

  if (chaser.status !== "pending_hitl" && chaser.status !== "draft_saved") {
    return NextResponse.json(
      { error: `Chaser already ${chaser.status}` },
      { status: 409 }
    );
  }

  const wasEdited = editedContent != null && editedContent !== chaser.draft_content;
  const finalContent = editedContent ?? chaser.draft_content;

  if (saveOnly) {
    const savePayload: Record<string, unknown> = {
      status: "draft_saved",
      draft_content: finalContent,
    };
    if (wasEdited) {
      savePayload.team_lead_edits = editedContent;
    }

    const { error: saveError } = await supabase.from("chasers").update(savePayload).eq("id", id);
    if (saveError) {
      console.error("[hitl/approve] Save draft failed:", saveError.message);
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    await supabase.from("audit_log").insert({
      entity_type: "chaser",
      entity_id: id,
      action: "chaser_saved",
      actor: "team_lead",
      metadata: { script_id: chaser.script_id },
    });

    return NextResponse.json({ success: true, status: "draft_saved" });
  }

  const newStatus = wasEdited ? "edited" : "approved";
  const clientEmail = chaser.clients?.email;
  const clientName = chaser.clients?.name ?? "there";

  const hitlSubject = chaser.hitl_state?.email_subject as string | undefined;
  const emailSubject = hitlSubject || `Following up: ${chaser.scripts?.title ?? "your script"}`;

  const clientWhatsApp = chaser.clients?.whatsapp_number as string | undefined;
  const sendChannel = channel ?? (chaser.clients as Record<string, unknown>)?.preferred_channel as string ?? "email";
  const sendEmail = sendChannel === "email" || sendChannel === "both";
  const sendWa = sendChannel === "whatsapp" || sendChannel === "both";

  // Delivery failure should not block approval
  let emailFailed = false;
  let emailError = "";
  let waFailed = false;
  let waError = "";

  if (sendEmail && clientEmail) {
    const reviewToken = chaser.scripts?.review_token as string | undefined;
    const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "https://greenlit.ruskaruma.me";
    const reviewUrl = reviewToken ? `${appUrl}/review/${reviewToken}` : undefined;
    console.log("[hitl/approve] Sending email to:", clientEmail, "subject:", emailSubject);
    try {
      const emailResult = await sendChaserEmail(clientEmail, finalContent, emailSubject, clientName, reviewUrl);
      if (!emailResult.success) {
        emailFailed = true;
        emailError = emailResult.error ?? "Unknown email error";
        console.error("[hitl/approve] Email send failed:", emailError);
      }
    } catch (err) {
      emailFailed = true;
      emailError = err instanceof Error ? err.message : "Email send threw unexpectedly";
      console.error("[hitl/approve] Email send threw:", emailError);
    }
  } else if (sendEmail && !clientEmail) {
    console.warn("[hitl/approve] No client email found for chaser", id, "— skipping email");
  }

  if (sendWa && clientWhatsApp) {
    console.log("[hitl/approve] Sending WhatsApp to:", clientWhatsApp);
    try {
      const waResult = await sendChaserWhatsApp({
        to: clientWhatsApp,
        clientName,
        draftContent: finalContent,
        subject: emailSubject,
      });
      if (!waResult.success) {
        waFailed = true;
        waError = waResult.error ?? "Unknown WhatsApp error";
        console.error("[hitl/approve] WhatsApp send failed:", waError);
      }
    } catch (err) {
      waFailed = true;
      waError = err instanceof Error ? err.message : "WhatsApp send threw unexpectedly";
      console.error("[hitl/approve] WhatsApp send threw:", waError);
    }
  } else if (sendWa && !clientWhatsApp) {
    console.warn("[hitl/approve] No WhatsApp number for chaser", id, "— skipping WhatsApp");
  }

  const allDeliveryFailed = (sendEmail ? emailFailed || !clientEmail : true) && (sendWa ? waFailed || !clientWhatsApp : true);

  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    sent_at: allDeliveryFailed ? null : new Date().toISOString(),
  };
  if (wasEdited) {
    updatePayload.team_lead_edits = editedContent;
  }

  const { error: updateError } = await supabase
    .from("chasers")
    .update(updatePayload)
    .eq("id", id);

  if (updateError) {
    console.error("[hitl/approve] Chaser update failed:", updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const threadId = `chaser-${chaser.script_id}`;
  resumeChaserGraph(
    threadId,
    wasEdited ? "edited" : "approved",
    editedContent
  ).catch((err: unknown) =>
    console.error("[hitl/approve] Graph resume failed (non-blocking):", err)
  );

  if (wasEdited && editedContent) {
    storeFewShotExample({
      clientId: chaser.client_id,
      chaserId: chaser.id,
      originalDraft: chaser.draft_content,
      editedDraft: editedContent,
      scriptTitle: chaser.scripts?.title ?? null,
    }).catch((err: unknown) =>
      console.error("[hitl/approve] Few-shot storage failed:", err)
    );
  }

  if (!allDeliveryFailed) {
    const { error: scriptResetError } = await supabase
      .from("scripts")
      .update({
        status: "pending_review",
        client_feedback: null,
        reviewed_at: null,
      })
      .eq("id", chaser.script_id);

    if (scriptResetError) {
      console.error("[hitl/approve] Script status reset failed:", scriptResetError.message);
    }
  }

  await supabase.from("audit_log").insert({
    entity_type: "chaser",
    entity_id: id,
    action: `chaser_${newStatus}`,
    actor: "team_lead",
    metadata: {
      script_id: chaser.script_id,
      was_edited: wasEdited,
      channel: sendChannel,
      email_sent: sendEmail ? !emailFailed : undefined,
      email_error: emailFailed ? emailError : undefined,
      whatsapp_sent: sendWa ? !waFailed : undefined,
      whatsapp_error: waFailed ? waError : undefined,
    },
  });

  const sentAt = chaser.scripts?.sent_at;
  const daysOverdue = sentAt
    ? Math.round((Date.now() - new Date(sentAt).getTime()) / 86400000)
    : 0;

  const critiqueScores = chaser.hitl_state?.critique_scores as
    | { professionalism?: number; personalization?: number }
    | null
    | undefined;

  storeClientMemory(
    chaser.client_id,
    buildChaserSentMemory({
      clientName,
      brand: chaser.clients?.company ?? null,
      scriptTitle: chaser.scripts?.title ?? "Unknown",
      platform: chaser.scripts?.platform ?? null,
      daysOverdue,
      critiqueScores,
      wasEdited,
    }),
    "chaser_sent",
    { chaser_id: id, script_id: chaser.script_id }
  ).catch((err: unknown) => console.error("[hitl/approve] Memory storage failed:", err));

  const warnings: string[] = [];
  if (emailFailed && sendEmail) warnings.push(`Email failed: ${emailError}`);
  if (waFailed && sendWa) warnings.push(`WhatsApp failed: ${waError}`);

  if (warnings.length > 0) {
    return NextResponse.json({
      success: true,
      status: newStatus,
      warning: `Approved but: ${warnings.join(". ")}`,
    });
  }

  return NextResponse.json({ success: true, status: newStatus });
}
