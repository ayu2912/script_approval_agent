import type { NodeLogEntry } from "./types";

// All possible statuses an approval thread can be in
export type ApprovalStatus =
  | "pending"
  | "request_sent"
  | "follow_up_1_sent"
  | "follow_up_2_sent"
  | "escalated"
  | "approved"
  | "revision_requested"
  | "rejected"
  | "call_requested"
  | "paused";

// What the cron or webhook resumes the graph with
export type ResumeAction =
  | "response"      // client replied
  | "follow_up_1"   // 24h elapsed, send reminder
  | "follow_up_2"   // 48h elapsed, send urgent
  | "escalate"      // 72h elapsed, alert account manager
  | "pause";        // account manager manually paused

// How Claude Sonnet classifies a client reply
export type ResponseClassification =
  | "approved"
  | "revision_requested"
  | "rejected"
  | "call_requested"
  | "partial_approval"
  | "ambiguous";

// The full state object that flows through every node in the approval graph
export interface ApprovalState {
  // Script context
  scriptId: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientWhatsApp: string | null;
  preferredChannel: "whatsapp" | "email";
  accountManagerEmail: string;
  accountManagerName: string;
  scriptTitle: string;
  scriptContent: string;
  scriptVersion: number;
  reviewToken: string | null;

  // Thread tracking
  threadId: string | null;
  approvalStatus: ApprovalStatus;
  followUpCount: number;
  isPaused: boolean;

  // Client memory context for personalisation
  clientMemories: string[];

  // Generated message content
  approvalRequestMessage: string | null;
  followUpMessage: string | null;
  escalationMessage: string | null;

  // Timestamps
  requestSentAt: string | null;
  followUp1SentAt: string | null;
  followUp2SentAt: string | null;

  // Resume control — set by cron or webhook before resuming
  resumeAction: ResumeAction | null;
  clientResponse: string | null;

  // Resolution
  responseClassification: ResponseClassification | null;
  approvedSections: string | null;
  revisionNotes: string | null;
  rejectionReason: string | null;

  // Error handling
  error: string | null;
  nodeLog: NodeLogEntry[];
}
