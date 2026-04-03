import { NextResponse } from "next/server";
import { ChatAnthropic } from "@langchain/anthropic";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { storeClientMemory } from "@/lib/agent/nodes/memoryUpdate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

const model = new ChatAnthropic({
  model: "claude-haiku-4-5-20251001",
  maxTokens: 500,
  temperature: 0.7,
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const supabase: SupabaseAny = createServiceClientDirect();

  let body: { instruction?: string; tone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { instruction, tone } = body;

  if (!instruction && !tone) {
    return NextResponse.json({ error: "instruction or tone required" }, { status: 400 });
  }

  const { data: chaser, error: fetchError } = await supabase
    .from("chasers")
    .select("id, script_id, client_id, draft_content, status, hitl_state, clients(name, company, email, avg_response_hours), scripts(title, content, sent_at, due_date, platform)")
    .eq("id", id)
    .single();

  if (fetchError || !chaser) {
    return NextResponse.json({ error: "Chaser not found" }, { status: 404 });
  }

  if (chaser.status !== "pending_hitl" && chaser.status !== "draft_saved") {
    return NextResponse.json({ error: `Chaser already ${chaser.status}` }, { status: 409 });
  }

  const { data: memories } = await supabase
    .from("client_memories")
    .select("content")
    .eq("client_id", chaser.client_id)
    .order("created_at", { ascending: false })
    .limit(5);

  const memoryContext = (memories ?? []).map((m: { content: string }) => `- ${m.content}`).join("\n") || "- No previous interactions on record.";

  const clientName = chaser.clients?.name ?? "the client";
  const scriptTitle = chaser.scripts?.title ?? "the script";
  const sentAt = chaser.scripts?.sent_at;
  const hoursOverdue = sentAt
    ? Math.round((Date.now() - new Date(sentAt).getTime()) / 3600000)
    : 0;

  const effectiveTone = tone ?? (chaser.hitl_state?.tone_recommendation as string) ?? "neutral";

  const systemPrompt = `You are a professional email writer for Scrollhouse, a video content agency. You are rewriting a follow-up email draft based on specific instructions from the team lead.

TONE & STYLE:
- Professional but warm. Never overly formal, never casual.
- Short sentences. Short paragraphs. Maximum 3 lines per paragraph.
- Never use em dashes. Use commas or full stops instead.
- No emojis. No exclamation marks unless absolutely necessary.
- Never start with "Hope you're doing well" or any variation of it.
- Get to the point in the first sentence.

TARGET TONE: ${effectiveTone}

CLIENT CONTEXT:
Client: ${clientName}
Script: "${scriptTitle}" — ${Math.round(hoursOverdue / 24)} days overdue

What you know about this client:
${memoryContext}

CRITICAL: Output in exactly this format:
SUBJECT: [subject line]
BODY: [email body]`;

  const instructionText = instruction ?? `Rewrite with ${tone} tone`;

  const humanPrompt = `Here is the current email draft:

${chaser.draft_content}

Team lead instruction: "${instructionText}"

Rewrite the email following the instruction. Keep the same general purpose but apply the requested changes. Keep it under 150 words.`;

  try {
    const response = await model.invoke([
      { role: "system", content: systemPrompt },
      { role: "human", content: humanPrompt },
    ]);

    const responseText = typeof response.content === "string"
      ? response.content
      : (response.content as Array<{ type: string; text?: string }>)
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");

    const subjectMatch = responseText.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
    const bodyMatch = responseText.match(/BODY:\s*([\s\S]+)/i);
    const newSubject = subjectMatch?.[1]?.trim() ?? (chaser.hitl_state?.email_subject as string) ?? `Following up: ${scriptTitle}`;
    const newBody = bodyMatch?.[1]?.trim() ?? responseText.trim();

    const updatedHitlState = {
      ...(chaser.hitl_state ?? {}),
      email_subject: newSubject,
      tone_recommendation: effectiveTone,
    };

    await supabase
      .from("chasers")
      .update({
        draft_content: newBody,
        hitl_state: updatedHitlState,
      })
      .eq("id", id);

    if (instruction) {
      storeClientMemory(
        chaser.client_id,
        `Team lead instruction for "${scriptTitle}": ${instruction}`,
        "hitl_instruction",
        { chaser_id: id, script_id: chaser.script_id, scope: "one-time" }
      ).catch((err: unknown) => console.error("[regenerate] Memory storage failed:", err));
    }

    await supabase.from("audit_log").insert({
      entity_type: "chaser",
      entity_id: id,
      action: "chaser_regenerated",
      actor: "team_lead",
      metadata: {
        instruction: instruction ?? null,
        tone: effectiveTone,
        script_id: chaser.script_id,
      },
    });

    return NextResponse.json({
      success: true,
      draft_content: newBody,
      email_subject: newSubject,
      tone_recommendation: effectiveTone,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regeneration failed";
    console.error("[regenerate] Failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
