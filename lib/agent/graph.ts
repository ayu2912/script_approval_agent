import { StateGraph, Annotation, END, START, interrupt, Command } from "@langchain/langgraph";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { SupabaseCheckpointSaver } from "./checkpointer";
import { monitorOverdueScripts } from "./nodes/monitor";
import { retrieveClientMemories } from "./nodes/ragRetrieval";
import { analyzeSentiment } from "./nodes/sentimentAnalysis";
import { determineChannel } from "./nodes/channelStrategy";
import { generateChaser } from "./nodes/generation";
import { selfCritique } from "./nodes/selfCritique";
import { reviseEmail } from "./nodes/revision";
import { addStreamEvent } from "./stream";
import { appendNodeLog } from "./types";
import type { AgentState, CritiqueScores, NodeLogEntry } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

const MAX_REVISIONS = 2;
const ESCALATION_THRESHOLD = 3;
const MIN_PASS_RATE = 8;
const CIRCUIT_BREAKER_LIMIT = 3;

const GraphState = Annotation.Root({
  scriptId: Annotation<string>(),
  clientId: Annotation<string>(),
  clientEmail: Annotation<string>(),
  clientName: Annotation<string>(),
  scriptTitle: Annotation<string>(),
  scriptContent: Annotation<string>(),
  sentAt: Annotation<string>(),
  dueDate: Annotation<string | null>(),
  hoursOverdue: Annotation<number>(),
  clientMemories: Annotation<string[]>(),
  generatedEmail: Annotation<string | null>(),
  emailSubject: Annotation<string | null>(),
  chaserId: Annotation<string | null>(),
  error: Annotation<string | null>(),
  urgencyScore: Annotation<number | null>(),
  toneRecommendation: Annotation<string | null>(),
  critiqueScores: Annotation<CritiqueScores | null>(),
  revisionCount: Annotation<number>(),
  nodeExecutionLog: Annotation<NodeLogEntry[]>({
    reducer: appendNodeLog,
    default: () => [],
  }),
  hitlAction: Annotation<string | null>(),
  hitlEditedContent: Annotation<string | null>(),
  recommendedChannel: Annotation<string | null>(),
  preferredChannel: Annotation<string | null>(),
  ragEmpty: Annotation<boolean | undefined>(),
});

async function ragNode(state: typeof GraphState.State): Promise<Partial<typeof GraphState.State>> {
  addStreamEvent(state.scriptId, { node: "ragRetrieval", status: "started", timestamp: new Date().toISOString() });
  const result = await retrieveClientMemories(state as AgentState);
  addStreamEvent(state.scriptId, { node: "ragRetrieval", status: "completed", timestamp: new Date().toISOString(), data: { memoriesFound: result.clientMemories.length } });
  return { clientMemories: result.clientMemories, ragEmpty: result.ragEmpty };
}

async function sentimentNode(state: typeof GraphState.State): Promise<Partial<typeof GraphState.State>> {
  addStreamEvent(state.scriptId, { node: "sentimentAnalysis", status: "started", timestamp: new Date().toISOString() });
  const result = await analyzeSentiment(state as AgentState);
  addStreamEvent(state.scriptId, { node: "sentimentAnalysis", status: "completed", timestamp: new Date().toISOString(), data: { urgencyScore: result.urgencyScore, tone: result.toneRecommendation } });
  return {
    urgencyScore: result.urgencyScore,
    toneRecommendation: result.toneRecommendation,
    nodeExecutionLog: result.nodeExecutionLog,
  };
}

async function channelStrategyNode(state: typeof GraphState.State): Promise<Partial<typeof GraphState.State>> {
  addStreamEvent(state.scriptId, { node: "channelStrategy", status: "started", timestamp: new Date().toISOString() });
  try {
    const result = await determineChannel(state as AgentState);
    addStreamEvent(state.scriptId, { node: "channelStrategy", status: "completed", timestamp: new Date().toISOString(), data: { channel: result.recommendedChannel } });
    return { recommendedChannel: result.recommendedChannel ?? null, preferredChannel: result.preferredChannel ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Channel strategy failed";
    console.error("[channelStrategy]", message);
    addStreamEvent(state.scriptId, { node: "channelStrategy", status: "error", timestamp: new Date().toISOString(), data: { error: message } });
    return { recommendedChannel: null, preferredChannel: null, error: message };
  }
}

async function generationNode(state: typeof GraphState.State): Promise<Partial<typeof GraphState.State>> {
  addStreamEvent(state.scriptId, { node: "generation", status: "started", timestamp: new Date().toISOString() });
  const result = await generateChaser(state as AgentState);
  addStreamEvent(state.scriptId, { node: "generation", status: result.error ? "error" : "completed", timestamp: new Date().toISOString(), data: { chaserId: result.chaserId } });
  return {
    generatedEmail: result.generatedEmail,
    emailSubject: result.emailSubject,
    chaserId: result.chaserId,
    error: result.error,
    nodeExecutionLog: result.nodeExecutionLog,
  };
}

async function critiqueNode(state: typeof GraphState.State): Promise<Partial<typeof GraphState.State>> {
  addStreamEvent(state.scriptId, { node: "selfCritique", status: "started", timestamp: new Date().toISOString() });
  const result = await selfCritique(state as AgentState);
  addStreamEvent(state.scriptId, { node: "selfCritique", status: "completed", timestamp: new Date().toISOString(), data: { scores: result.critiqueScores } });
  return {
    critiqueScores: result.critiqueScores,
    nodeExecutionLog: result.nodeExecutionLog,
  };
}

async function revisionNode(state: typeof GraphState.State): Promise<Partial<typeof GraphState.State>> {
  addStreamEvent(state.scriptId, { node: "revision", status: "started", timestamp: new Date().toISOString() });
  const result = await reviseEmail(state as AgentState);
  addStreamEvent(state.scriptId, { node: "revision", status: "completed", timestamp: new Date().toISOString(), data: { revisionCount: result.revisionCount } });
  return {
    generatedEmail: result.generatedEmail,
    emailSubject: result.emailSubject,
    revisionCount: result.revisionCount,
    critiqueScores: result.critiqueScores,
    nodeExecutionLog: result.nodeExecutionLog,
  };
}

function routeAfterCritique(state: typeof GraphState.State): "revision" | "finalize" {
  if (
    state.critiqueScores &&
    state.critiqueScores.average < MIN_PASS_RATE &&
    state.revisionCount < MAX_REVISIONS
  ) {
    return "revision";
  }
  return "finalize";
}

async function checkAndEscalateScript(scriptId: string, supabase: SupabaseAny): Promise<void> {
  const { error: updateError } = await supabase
    .from("scripts")
    .update({ status: "escalated" })
    .eq("id", scriptId)
    .neq("status", "escalated")
    .lt(
      "id",
      supabase
        .from("chasers")
        .select("script_id", { count: "exact", head: true })
        .eq("script_id", scriptId)
        .in("status", ["sent", "approved", "edited"])
    );

  const { count, error: countError } = await supabase
    .from("chasers")
    .select("id", { count: "exact", head: true })
    .eq("script_id", scriptId)
    .in("status", ["sent", "approved", "edited"]);

  if (countError) {
    console.error("[escalation] Failed to count chasers:", countError.message);
    return;
  }

  if ((count ?? 0) < ESCALATION_THRESHOLD) return;

  const { data: script } = await supabase
    .from("scripts")
    .select("status")
    .eq("id", scriptId)
    .single();

  if (script?.status === "escalated") return;

  const { error: escError } = await supabase
    .from("scripts")
    .update({ status: "escalated" })
    .eq("id", scriptId)
    .neq("status", "escalated");

  if (escError) {
    console.error("[escalation] Failed to escalate script:", escError.message);
    return;
  }

  if (updateError) {
    // logged but non-fatal
  }

  await supabase.from("audit_log").insert({
    entity_type: "script",
    entity_id: scriptId,
    action: "auto_escalated",
    actor: "system",
    metadata: { chaser_count: count, threshold: ESCALATION_THRESHOLD },
  }).then(({ error: auditError }: { error: { message: string } | null }) => {
    if (auditError) console.error("[escalation] Failed to insert audit log:", auditError.message);
  });
}

async function finalizeNode(state: typeof GraphState.State): Promise<Partial<typeof GraphState.State>> {
  if (!state.chaserId) return {};

  const supabase: SupabaseAny = createServiceClientDirect();

  const updatePayload: Record<string, unknown> = {};

  if (state.generatedEmail) {
    updatePayload.draft_content = state.generatedEmail;
  }

  updatePayload.hitl_state = {
    email_subject: state.emailSubject,
    client_email: state.clientEmail,
    hours_overdue: state.hoursOverdue,
    memories_used: state.clientMemories.length,
    tone_recommendation: state.toneRecommendation ?? "neutral",
    urgency_score: state.urgencyScore,
    revision_count: state.revisionCount,
    ...(state.critiqueScores ? {
      critique_scores: {
        professionalism: state.critiqueScores.professionalism,
        personalization: state.critiqueScores.personalization,
        clarity: state.critiqueScores.clarity,
        persuasiveness: state.critiqueScores.persuasiveness,
        average: state.critiqueScores.average,
      },
      critique_feedback: state.critiqueScores.feedback,
    } : {}),
  };

  if (state.nodeExecutionLog.length > 0) {
    updatePayload.node_execution_log = state.nodeExecutionLog;
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error } = await supabase.from("chasers").update(updatePayload).eq("id", state.chaserId);
    if (error) {
      console.error("[finalize] Failed to update chaser:", error.message);
    }
  }

  await checkAndEscalateScript(state.scriptId, supabase);

  return {};
}

interface ResumeValue {
  action: string;
  editedContent?: string | null;
}

function isValidResumeValue(value: unknown): value is ResumeValue {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.action === "string";
}

function hitlNode(state: typeof GraphState.State): Partial<typeof GraphState.State> {
  addStreamEvent(state.scriptId, { node: "hitl", status: "started", timestamp: new Date().toISOString() });

  const resume = interrupt({
    chaserId: state.chaserId,
    scriptId: state.scriptId,
    clientId: state.clientId,
    draftContent: state.generatedEmail,
    emailSubject: state.emailSubject,
    critiqueScores: state.critiqueScores,
  });

  if (!isValidResumeValue(resume)) {
    console.error("[hitl] Invalid resume value shape:", JSON.stringify(resume));
    return { error: "Invalid resume value received at HITL node" };
  }

  const action = resume.action;
  const editedContent = resume.editedContent ?? null;

  addStreamEvent(state.scriptId, { node: "hitl", status: "completed", timestamp: new Date().toISOString(), data: { action } });

  return {
    hitlAction: action,
    hitlEditedContent: editedContent,
    ...(editedContent ? { generatedEmail: editedContent } : {}),
  };
}

function routeAfterHitl(state: typeof GraphState.State): "delivery" | "generation" | typeof END {
  if (state.hitlAction === "approved" || state.hitlAction === "edited") {
    return "delivery";
  }
  if (state.hitlAction === "rejected") {
    return "generation";
  }
  return END;
}

async function deliveryNode(state: typeof GraphState.State): Promise<Partial<typeof GraphState.State>> {
  if (!state.chaserId) return {};

  const supabase: SupabaseAny = createServiceClientDirect();
  const newStatus = state.hitlAction === "edited" ? "edited" : "approved";

  const updatePayload: Record<string, unknown> = {
    status: newStatus,
  };

  if (state.hitlEditedContent) {
    updatePayload.draft_content = state.hitlEditedContent;
    updatePayload.team_lead_edits = state.hitlEditedContent;
  }

  if (state.recommendedChannel) {
    updatePayload.recommended_channel = state.recommendedChannel;
    updatePayload.delivery_channel = state.recommendedChannel;
  }

  const { error } = await supabase.from("chasers").update(updatePayload).eq("id", state.chaserId);
  if (error) {
    console.error("[delivery] Failed to update chaser:", error.message);
  }

  addStreamEvent(state.scriptId, { node: "delivery", status: "completed", timestamp: new Date().toISOString(), data: { status: newStatus, channel: state.recommendedChannel } });

  return {};
}

const checkpointer = new SupabaseCheckpointSaver();

const workflow = new StateGraph(GraphState)
  .addNode("ragRetrieval", ragNode)
  .addNode("sentimentAnalysis", sentimentNode)
  .addNode("channelStrategy", channelStrategyNode)
  .addNode("generation", generationNode)
  .addNode("selfCritique", critiqueNode)
  .addNode("revision", revisionNode)
  .addNode("finalize", finalizeNode)
  .addNode("hitl", hitlNode)
  .addNode("delivery", deliveryNode)
  .addEdge(START, "ragRetrieval")
  .addEdge("ragRetrieval", "sentimentAnalysis")
  .addEdge("sentimentAnalysis", "channelStrategy")
  .addEdge("channelStrategy", "generation")
  .addEdge("generation", "selfCritique")
  .addConditionalEdges("selfCritique", routeAfterCritique)
  .addEdge("revision", "selfCritique")
  .addEdge("finalize", "hitl")
  .addConditionalEdges("hitl", routeAfterHitl)
  .addEdge("delivery", END)
  .compile({ checkpointer });

function defaultState(): Partial<AgentState> {
  return {
    urgencyScore: null,
    toneRecommendation: null,
    critiqueScores: null,
    revisionCount: 0,
    nodeExecutionLog: [],
    recommendedChannel: null,
    preferredChannel: null,
  };
}

export async function runChaserForScript(initialState: AgentState): Promise<AgentState> {
  const fullState = { ...defaultState(), ...initialState, hitlAction: null, hitlEditedContent: null };
  const threadId = `chaser-${initialState.scriptId}`;

  const config = {
    configurable: { thread_id: threadId },
  };

  const result = await workflow.invoke(fullState, config);
  return result as AgentState;
}

export async function resumeChaserGraph(
  threadId: string,
  action: "approved" | "edited" | "rejected",
  editedContent?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const resumeValue = { action, editedContent: editedContent ?? null };

    await workflow.invoke(new Command({ resume: resumeValue }), {
      configurable: { thread_id: threadId },
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Resume failed";
    console.error("[graph] Resume failed:", message);
    return { success: false, error: message };
  }
}

export async function getThreadState(threadId: string) {
  return workflow.getState({ configurable: { thread_id: threadId } });
}

export async function runChaserAgent(): Promise<{ processed: number; errors: string[] }> {
  const overdueScripts = await monitorOverdueScripts();

  if (overdueScripts.length === 0) {
    console.log("[agent] No overdue scripts to process");
    return { processed: 0, errors: [] };
  }

  const errors: string[] = [];
  let processed = 0;
  let consecutiveFailures = 0;

  for (const state of overdueScripts) {
    if (consecutiveFailures >= CIRCUIT_BREAKER_LIMIT) {
      const msg = `Circuit breaker tripped after ${CIRCUIT_BREAKER_LIMIT} consecutive failures — aborting remaining ${overdueScripts.length - processed - errors.length} scripts`;
      console.error(`[agent] ${msg}`);
      errors.push(msg);
      break;
    }

    try {
      const result = await runChaserForScript(state);
      if (result.error) {
        errors.push(`Script ${state.scriptId}: ${result.error}`);
        consecutiveFailures++;
      } else {
        processed++;
        consecutiveFailures = 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`Script ${state.scriptId}: ${msg}`);
      consecutiveFailures++;
    }
  }

  console.log(`[agent] Processed ${processed}/${overdueScripts.length}, errors: ${errors.length}`);
  return { processed, errors };
}
