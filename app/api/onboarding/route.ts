import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { createClient as createClientInDb } from "@/lib/clients/createClient";
import { storeClientMemory } from "@/lib/agent/nodes/memoryUpdate";
import { sendWelcomeEmail } from "@/lib/resend/sendWelcomeEmail";
import { createClientFolder } from "@/lib/integrations/googleDrive";
import { createClientPage } from "@/lib/integrations/notion";
import { addClientRecord } from "@/lib/integrations/airtable";
import twilio from "twilio";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

interface SSEEvent {
  step: string;
  status: "started" | "completed" | "error" | "skipped";
  label: string;
  error?: string;
  data?: Record<string, unknown>;
}

function emit(controller: ReadableStreamDefaultController, event: SSEEvent) {
  try {
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
  } catch {
    // Client disconnected
  }
}

export async function POST(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    name,
    email,
    company,
    whatsapp_number,
    preferred_channel,
    instagram_handle,
    youtube_channel_id,
    twitter_handle,
    linkedin_url,
    brand_voice,
    account_manager,
    contract_start,
    monthly_volume,
    platform_focus,
  } = body as Record<string, string | string[] | undefined>;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!email || typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const ONBOARDING_STREAM_TIMEOUT_MS = 300_000;

  const stream = new ReadableStream({
    async start(controller) {
      const results: Record<string, { success: boolean; error?: string }> = {};

      const timeoutId = setTimeout(() => {
        console.warn("[onboarding] Stream timeout exceeded");
        emit(controller, {
          step: "done",
          status: "error",
          label: "Onboarding timed out",
          data: { type: "timeout", message: "Stream exceeded maximum duration" },
        });
        try { controller.close(); } catch { /* already closed */ }
      }, ONBOARDING_STREAM_TIMEOUT_MS);

      emit(controller, { step: "client_create", status: "started", label: "Creating client in database..." });

      const clientResult = await createClientInDb({
        name: name as string,
        email: email as string,
        company: (company as string) || null,
        whatsapp_number: (whatsapp_number as string) || null,
        preferred_channel: (preferred_channel as string) || "email",
        instagram_handle: (instagram_handle as string) || null,
        youtube_channel_id: (youtube_channel_id as string) || null,
        twitter_handle: (twitter_handle as string) || null,
        linkedin_url: (linkedin_url as string) || null,
        brand_voice: (brand_voice as string) || null,
        account_manager: (account_manager as string) || null,
        contract_start: (contract_start as string) || null,
        monthly_volume: monthly_volume ? parseInt(monthly_volume as string) : null,
        platform_focus: (platform_focus as string[])?.length > 0 ? (platform_focus as string[]) : null,
        onboarding_checklist: {
          welcome_email: false,
          google_drive: false,
          notion_page: false,
          airtable_entry: false,
          first_brief: false,
        },
      });

      if (clientResult.error) {
        clearTimeout(timeoutId);
        emit(controller, {
          step: "client_create",
          status: "error",
          label: "Client creation failed",
          error: clientResult.error,
        });
        emit(controller, {
          step: "done",
          status: "error",
          label: "Onboarding failed",
          data: { client: null, results: {} },
        });
        controller.close();
        return;
      }

      const client = clientResult.client as Record<string, unknown>;
      const clientId = client.id as string;
      emit(controller, {
        step: "client_create",
        status: "completed",
        label: "Client created",
        data: { clientId },
      });

      const supabase: SupabaseAny = createServiceClientDirect();


      emit(controller, { step: "memories", status: "started", label: "Seeding AI memories..." });
      try {
        const platformStr = (platform_focus as string[])?.length > 0 ? (platform_focus as string[]).join(", ") : "not specified";
        const voiceStr = (brand_voice as string) || "no specific brand voice noted";

        await storeClientMemory(
          clientId,
          `New client onboarded: ${name}${company ? ` (${company})` : ""}. Preferred channel: ${preferred_channel || "email"}. Platforms: ${platformStr}. Monthly volume: ${monthly_volume || "not set"} pieces.`,
          "behavioral_pattern"
        );
        await storeClientMemory(
          clientId,
          `Brand voice and communication style: ${voiceStr}. ${account_manager ? `Account manager: ${account_manager}.` : ""}`,
          "behavioral_pattern"
        );
        await storeClientMemory(
          clientId,
          `Client prefers communication via ${preferred_channel || "email"}.${whatsapp_number ? ` WhatsApp available at ${whatsapp_number}.` : " No WhatsApp number provided."} This is a new client, no approval history yet.`,
          "behavioral_pattern"
        );
        results.memories = { success: true };
        emit(controller, { step: "memories", status: "completed", label: "3 memories seeded" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Memory seeding failed";
        console.error("[onboarding] Memory error:", msg);
        results.memories = { success: false, error: msg };
        emit(controller, { step: "memories", status: "error", label: "Memory seeding failed", error: msg });
      }


      emit(controller, { step: "welcome_email", status: "started", label: "Sending welcome email..." });
      try {
        const emailResult = await sendWelcomeEmail({
          to: email as string,
          clientName: name as string,
          company: (company as string) || null,
          accountManager: (account_manager as string) || null,
        });
        results.welcome_email = emailResult;

        if (emailResult.success) {
          await supabase
            .from("clients")
            .update({ onboarding_checklist: { ...(client.onboarding_checklist as Record<string, boolean> ?? {}), welcome_email: true } })
            .eq("id", clientId);
          emit(controller, { step: "welcome_email", status: "completed", label: "Welcome email sent" });
        } else {
          emit(controller, { step: "welcome_email", status: "error", label: "Welcome email failed", error: emailResult.error });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Email failed";
        results.welcome_email = { success: false, error: msg };
        emit(controller, { step: "welcome_email", status: "error", label: "Welcome email failed", error: msg });
      }


      emit(controller, { step: "whatsapp", status: "started", label: "Sending WhatsApp notification..." });
      const demoWhatsApp = process.env.DEMO_WHATSAPP_NUMBER;
      const twilioFrom = process.env.TWILIO_WHATSAPP_FROM;
      if (twilioClient && demoWhatsApp && twilioFrom) {
        try {
          await twilioClient.messages.create({
            body: `New client onboarded: ${name}${company ? ` (${company})` : ""}. Email: ${email}. Channel: ${preferred_channel || "email"}.`,
            from: twilioFrom,
            to: `whatsapp:${demoWhatsApp}`,
          });
          results.whatsapp = { success: true };
          emit(controller, { step: "whatsapp", status: "completed", label: "WhatsApp notification sent" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "WhatsApp failed";
          console.error("[onboarding] WhatsApp error:", msg);
          results.whatsapp = { success: false, error: msg };
          emit(controller, { step: "whatsapp", status: "error", label: "WhatsApp failed", error: msg });
        }
      } else {
        results.whatsapp = { success: false, error: "Twilio not configured" };
        emit(controller, { step: "whatsapp", status: "skipped", label: "WhatsApp not configured" });
      }


      emit(controller, { step: "google_drive", status: "started", label: "Creating Google Drive folder..." });
      try {
        const driveResult = await createClientFolder({
          clientName: name as string,
          company: (company as string) || undefined,
          clientEmail: email as string,
        });
        results.google_drive = driveResult;

        if (driveResult.success) {
          await supabase
            .from("clients")
            .update({
              onboarding_checklist: {
                ...(client.onboarding_checklist ?? {}),
                welcome_email: results.welcome_email?.success ?? false,
                google_drive: true,
                google_drive_url: driveResult.folderUrl,
              },
            })
            .eq("id", clientId);
          emit(controller, { step: "google_drive", status: "completed", label: "Google Drive folder created" });
        } else {
          emit(controller, { step: "google_drive", status: "error", label: "Google Drive failed", error: driveResult.error });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Google Drive failed";
        console.error("[onboarding] Google Drive error:", msg);
        results.google_drive = { success: false, error: msg };
        emit(controller, { step: "google_drive", status: "error", label: "Google Drive failed", error: msg });
      }


      emit(controller, { step: "notion_page", status: "started", label: "Creating Notion page..." });
      try {
        const notionResult = await createClientPage({
          clientName: name as string,
          company: (company as string) || undefined,
          email: email as string,
          accountManager: (account_manager as string) || undefined,
          platforms: (platform_focus as string[])?.length > 0 ? (platform_focus as string[]) : undefined,
          brandVoice: (brand_voice as string) || undefined,
          contractStart: (contract_start as string) || undefined,
          monthlyVolume: monthly_volume ? parseInt(monthly_volume as string) : undefined,
        });
        results.notion_page = notionResult;

        if (notionResult.success) {
          const currentChecklist = (
            await supabase.from("clients").select("onboarding_checklist").eq("id", clientId).single()
          ).data?.onboarding_checklist ?? {};
          await supabase
            .from("clients")
            .update({ onboarding_checklist: { ...currentChecklist, notion_page: true, notion_page_url: notionResult.pageUrl } })
            .eq("id", clientId);
          emit(controller, { step: "notion_page", status: "completed", label: "Notion page created" });
        } else {
          emit(controller, { step: "notion_page", status: "error", label: "Notion failed", error: notionResult.error });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Notion failed";
        console.error("[onboarding] Notion error:", msg);
        results.notion_page = { success: false, error: msg };
        emit(controller, { step: "notion_page", status: "error", label: "Notion failed", error: msg });
      }


      emit(controller, { step: "airtable_entry", status: "started", label: "Adding Airtable record..." });
      try {
        const airtableResult = await addClientRecord({
          clientName: name as string,
          company: (company as string) || undefined,
          email: email as string,
          accountManager: (account_manager as string) || undefined,
          platforms: (platform_focus as string[])?.length > 0 ? (platform_focus as string[]) : undefined,
          monthlyVolume: monthly_volume ? parseInt(monthly_volume as string) : undefined,
          contractStart: (contract_start as string) || undefined,
        });
        results.airtable_entry = airtableResult;

        if (airtableResult.success) {
          const currentChecklist = (
            await supabase.from("clients").select("onboarding_checklist").eq("id", clientId).single()
          ).data?.onboarding_checklist ?? {};
          await supabase
            .from("clients")
            .update({ onboarding_checklist: { ...currentChecklist, airtable_entry: true, airtable_record_url: airtableResult.recordUrl } })
            .eq("id", clientId);
          emit(controller, { step: "airtable_entry", status: "completed", label: "Airtable record added" });
        } else {
          emit(controller, { step: "airtable_entry", status: "error", label: "Airtable failed", error: airtableResult.error });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Airtable failed";
        console.error("[onboarding] Airtable error:", msg);
        results.airtable_entry = { success: false, error: msg };
        emit(controller, { step: "airtable_entry", status: "error", label: "Airtable failed", error: msg });
      }


      emit(controller, { step: "audit_log", status: "started", label: "Logging to audit trail..." });
      try {
        await supabase.from("audit_log").insert({
          entity_type: "client",
          entity_id: clientId,
          action: "client_onboarded",
          actor: "team_lead",
          metadata: { name, email, company, platform_focus, results },
        });
        results.audit_log = { success: true };
        emit(controller, { step: "audit_log", status: "completed", label: "Audit log recorded" });
      } catch {
        console.error("[onboarding] Audit log failed");
        results.audit_log = { success: false, error: "Audit log failed" };
        emit(controller, { step: "audit_log", status: "error", label: "Audit log failed" });
      }


      clearTimeout(timeoutId);
      emit(controller, {
        step: "done",
        status: "completed",
        label: "Onboarding complete",
        data: { client, results },
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
