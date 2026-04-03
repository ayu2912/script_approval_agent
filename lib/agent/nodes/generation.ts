import { ChatAnthropic } from "@langchain/anthropic";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { MODEL_CLAUDE_HAIKU } from "../config";
import { assembleContext } from "./contextAssembly";
import type { AgentState, NodeLogEntry } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

const model = new ChatAnthropic({
  model: MODEL_CLAUDE_HAIKU,
  maxTokens: 500,
  temperature: 0.7,
});

function formatReadableDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function replacePlaceholders(text: string, state: AgentState): string {
  const sentDate = formatReadableDate(state.sentAt);
  const dueDate = state.dueDate ? formatReadableDate(state.dueDate) : sentDate;

  return text
    .replace(/\[date\]/gi, sentDate)
    .replace(/\[due.?date\]/gi, dueDate)
    .replace(/\[your\s*name\]/gi, "Scrollhouse Team")
    .replace(/\[team\s*name\]/gi, "Scrollhouse Team")
    .replace(/\[company\]/gi, "Scrollhouse");
}

function parseEmailResponse(text: string, state: AgentState): { subject: string; body: string } {
  const subjectMatch = text.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+?)(?:\n(?:NOTE|PS|SIGNATURE|---|\[).*$|$)/im);

  const rawSubject = subjectMatch?.[1]?.trim() ?? "Following up on your script review";

  let rawBody: string;
  if (bodyMatch?.[1]?.trim()) {
    rawBody = bodyMatch[1].trim();
  } else if (subjectMatch) {
    const afterSubject = text.slice((subjectMatch.index ?? 0) + subjectMatch[0].length).trim();
    rawBody = afterSubject || text.trim();
  } else {
    rawBody = text.trim();
  }

  return {
    subject: replacePlaceholders(rawSubject, state),
    body: replacePlaceholders(rawBody, state),
  };
}

export async function generateChaser(state: AgentState): Promise<AgentState> {
  const supabase: SupabaseAny = createServiceClientDirect();
  const start = Date.now();

  try {
    const { prompt, variables } = await assembleContext(state);
    const chain = prompt.pipe(model);
    const response = await chain.invoke(variables);

    const responseText = typeof response.content === "string"
      ? response.content
      : (response.content as Array<{ type: string; text?: string }>)
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");

    const { subject, body } = parseEmailResponse(responseText, state);

    if (!body || body.length < 20) {
      console.error("[generation] Generated email is empty or too short:", body?.length ?? 0);
      return { ...state, error: "Generated email was empty or too short" };
    }

    const { data: chaser, error: chaserError } = await supabase
      .from("chasers")
      .insert({
        script_id: state.scriptId,
        client_id: state.clientId,
        draft_content: body,
        status: "pending_hitl",
        hitl_state: {
          email_subject: subject,
          client_email: state.clientEmail,
          hours_overdue: state.hoursOverdue,
          memories_used: state.clientMemories.length,
          tone_recommendation: state.toneRecommendation ?? "neutral",
        },
      })
      .select("id")
      .single();

    if (chaserError) {
      console.error("[generation] Failed to store chaser:", chaserError.message);
      return { ...state, error: `Failed to store chaser: ${chaserError.message}` };
    }

    await supabase.from("audit_log").insert({
      entity_type: "chaser",
      entity_id: chaser.id,
      action: "chaser_generated",
      actor: "agent",
      metadata: {
        script_id: state.scriptId,
        client_id: state.clientId,
        hours_overdue: state.hoursOverdue,
        memories_used: state.clientMemories.length,
      },
    });

    console.log(`[generation] Created chaser ${chaser.id} for script ${state.scriptId}`);

    const entry: NodeLogEntry = {
      node: "generation",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      summary: `Generated draft, chaser ${chaser.id}`,
    };

    return {
      ...state,
      generatedEmail: body,
      emailSubject: subject,
      chaserId: chaser.id,
      nodeExecutionLog: [...(state.nodeExecutionLog ?? []), entry],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown generation error";
    console.error("[generation] Failed:", message);

    const entry: NodeLogEntry = {
      node: "generation",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      summary: `Error: ${message}`,
    };

    return {
      ...state,
      error: message,
      nodeExecutionLog: [...(state.nodeExecutionLog ?? []), entry],
    };
  }
}
