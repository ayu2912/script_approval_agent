import {
  StateGraph,
  Annotation,
  END,
  START,
  interrupt,
  Command,
} from "@langchain/langgraph";
import { SupabaseCheckpointSaver } from "./checkpointer";
import { appendNodeLog } from "./types";
import { fetchContext } from "./nodes/approval/fetchContext";
import { fetchClientMemory } from "./nodes/approval/fetchClientMemory";
import { generateApprovalRequest } from "./nodes/approval/generateApprovalRequest";
import { sendApprovalMessage } from "./nodes/approval/sendApprovalMessage";
import { generateFollowUp } from "./nodes/approval/generateFollowUp";
import { classifyResponse } from "./nodes/approval/classifyResponse";
import { generateEscalation } from "./nodes/approval/generateEscalation";
import { resolveApproval } from "./nodes/approval/resolveApproval";
import type {
  ApprovalState,
  ApprovalStatus,
  ResumeAction,
  ResponseClassification,
} from "./approvalTypes";
import type { NodeLogEntry } from "./types";

// ── Graph State Definition ────────────────────────────────────────────────────

const ApprovalGraphState = Annotation.Root({
  scriptId:               Annotation<string>(),
  clientId:               Annotation<string>(),
  clientName:             Annotation<string>(),
  clientEmail:            Annotation<string>(),
  clientWhatsApp:         Annotation<string | null>(),
  preferredChannel:       Annotation<"whatsapp" | "email">(),
  accountManagerEmail:    Annotation<string>(),
  accountManagerName:     Annotation<string>(),
  scriptTitle:            Annotation<string>(),
  scriptContent:          Annotation<string>(),
  scriptVersion:          Annotation<number>(),
  reviewToken:            Annotation<string | null>(),
  threadId:               Annotation<string | null>(),
  approvalStatus:         Annotation<ApprovalStatus>(),
  followUpCount:          Annotation<number>(),
  isPaused:               Annotation<boolean>(),
  clientMemories:         Annotation<string[]>(),
  approvalRequestMessage: Annotation<string | null>(),
  followUpMessage:        Annotation<string | null>(),
  escalationMessage:      Annotation<string | null>(),
  requestSentAt:          Annotation<string | null>(),
  followUp1SentAt:        Annotation<string | null>(),
  followUp2SentAt:        Annotation<string | null>(),
  resumeAction:           Annotation<ResumeAction | null>(),
  clientResponse:         Annotation<string | null>(),
  responseClassification: Annotation<ResponseClassification | null>(),
  approvedSections:       Annotation<string | null>(),
  revisionNotes:          Annotation<string | null>(),
  rejectionReason:        Annotation<string | null>(),
  error:                  Annotation<string | null>(),
  nodeLog: Annotation<NodeLogEntry[]>({
    reducer: appendNodeLog,
    default: () => [],
  }),
});

type GraphState = typeof ApprovalGraphState.State;

// ── Node Wrappers ─────────────────────────────────────────────────────────────

async function fetchContextNode(state: GraphState): Promise<Partial<GraphState>> {
  return fetchContext(state as ApprovalState);
}

async function fetchClientMemoryNode(state: GraphState): Promise<Partial<GraphState>> {
  return fetchClientMemory(state as ApprovalState);
}

async function generateApprovalRequestNode(state: GraphState): Promise<Partial<GraphState>> {
  return generateApprovalRequest(state as ApprovalState);
}

async function sendApprovalMessageNode(state: GraphState): Promise<Partial<GraphState>> {
  return sendApprovalMessage(state as ApprovalState);
}

// ── INTERRUPT NODE: Pauses graph, waits for cron or webhook to resume ─────────
function waitForResponseNode(state: GraphState): Partial<GraphState> {
  const resume = interrupt({
    scriptId: state.scriptId,
    approvalStatus: state.approvalStatus,
    threadId: state.threadId,
    followUpCount: state.followUpCount,
  });

  // resume is whatever was passed in Command({ resume: ... })
  const resumeData = resume as {
    action: ResumeAction;
    clientResponse?: string;
  };

  return {
    resumeAction: resumeData?.action ?? null,
    clientResponse: resumeData?.clientResponse ?? null,
  };
}

async function generateFollowUpNode(state: GraphState): Promise<Partial<GraphState>> {
  return generateFollowUp(state as ApprovalState);
}

async function classifyResponseNode(state: GraphState): Promise<Partial<GraphState>> {
  return classifyResponse(state as ApprovalState);
}

async function generateEscalationNode(state: GraphState): Promise<Partial<GraphState>> {
  return generateEscalation(state as ApprovalState);
}

async function resolveApprovalNode(state: GraphState): Promise<Partial<GraphState>> {
  return resolveApproval(state as ApprovalState);
}

// ── Routing Logic ─────────────────────────────────────────────────────────────

function routeAfterWait(
  state: GraphState
): "generateFollowUp" | "classifyResponse" | "generateEscalation" | typeof END {
  if (state.isPaused) return END;

  switch (state.resumeAction) {
    case "response":     return "classifyResponse";
    case "follow_up_1":  return "generateFollowUp";
    case "follow_up_2":  return "generateFollowUp";
    case "escalate":     return "generateEscalation";
    default:             return END;
  }
}

function routeAfterClassify(
  state: GraphState
): "resolveApproval" | typeof END {
  // Always resolve — resolveApproval handles all classifications
  if (state.responseClassification) return "resolveApproval";
  return END;
}

// After sending a follow-up, loop back to wait for the next response
function routeAfterFollowUp(
  state: GraphState
): "waitForResponse" | "generateEscalation" | typeof END {
  if (state.followUpCount >= 2) return "generateEscalation";
  return "waitForResponse";
}

// ── Build Graph ───────────────────────────────────────────────────────────────

const checkpointer = new SupabaseCheckpointSaver();

const workflow = new StateGraph(ApprovalGraphState)
  .addNode("fetchContext",             fetchContextNode)
  .addNode("fetchClientMemory",        fetchClientMemoryNode)
  .addNode("generateApprovalRequest",  generateApprovalRequestNode)
  .addNode("sendApprovalMessage",      sendApprovalMessageNode)
  .addNode("waitForResponse",          waitForResponseNode)
  .addNode("generateFollowUp",         generateFollowUpNode)
  .addNode("classifyResponse",         classifyResponseNode)
  .addNode("generateEscalation",       generateEscalationNode)
  .addNode("resolveApproval",          resolveApprovalNode)
  // Edges
  .addEdge(START,                       "fetchContext")
  .addEdge("fetchContext",              "fetchClientMemory")
  .addEdge("fetchClientMemory",         "generateApprovalRequest")
  .addEdge("generateApprovalRequest",   "sendApprovalMessage")
  .addEdge("sendApprovalMessage",       "waitForResponse")
  .addConditionalEdges("waitForResponse", routeAfterWait)
  .addConditionalEdges("generateFollowUp", routeAfterFollowUp)
  .addConditionalEdges("classifyResponse", routeAfterClassify)
  .addEdge("resolveApproval",           END)
  .addEdge("generateEscalation",        END)
  .compile({ checkpointer });

// ── Public API ────────────────────────────────────────────────────────────────

function defaultApprovalState(): Partial<ApprovalState> {
  return {
    clientId: "",
    clientName: "",
    clientEmail: "",
    clientWhatsApp: null,
    preferredChannel: "email",
    accountManagerEmail: "",
    accountManagerName: "The Scrollhouse Team",
    scriptTitle: "",
    scriptContent: "",
    scriptVersion: 1,
    reviewToken: null,
    threadId: null,
    approvalStatus: "pending",
    followUpCount: 0,
    isPaused: false,
    clientMemories: [],
    approvalRequestMessage: null,
    followUpMessage: null,
    escalationMessage: null,
    requestSentAt: null,
    followUp1SentAt: null,
    followUp2SentAt: null,
    resumeAction: null,
    clientResponse: null,
    responseClassification: null,
    approvedSections: null,
    revisionNotes: null,
    rejectionReason: null,
    error: null,
    nodeLog: [],
  };
}

/**
 * Start a new approval flow for a script.
 * Called by POST /api/approval/trigger/[scriptId]
 */
export async function startApprovalFlow(
  scriptId: string
): Promise<{ success: boolean; threadId?: string; error?: string }> {
  const threadId = `approval-${scriptId}-v1`;
  const initialState = {
    ...defaultApprovalState(),
    scriptId,
  };

  try {
    await workflow.invoke(initialState, {
      configurable: { thread_id: threadId },
    });
    return { success: true, threadId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[approvalGraph] startApprovalFlow failed:", message);
    return { success: false, error: message };
  }
}

/**
 * Resume an interrupted approval graph.
 * Called by:
 *   - POST /api/webhooks/twilio (client replied)
 *   - GET  /api/cron/approval-monitor (time elapsed)
 */
export async function resumeApprovalFlow(
  threadId: string,
  action: ResumeAction,
  clientResponse?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await workflow.invoke(
      new Command({
        resume: { action, clientResponse: clientResponse ?? null },
      }),
      { configurable: { thread_id: threadId } }
    );
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Resume failed";
    console.error("[approvalGraph] resumeApprovalFlow failed:", message);
    return { success: false, error: message };
  }
}

/**
 * Get the current state of an approval thread.
 */
export async function getApprovalThreadState(threadId: string) {
  return workflow.getState({ configurable: { thread_id: threadId } });
}
