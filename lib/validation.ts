import type { ScriptStatus } from "@/lib/supabase/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

const validStatuses: ScriptStatus[] = [
  "draft",
  "pending_review",
  "changes_requested",
  "approved",
  "rejected",
  "overdue",
  "escalated",
  "closed",
];

export function isValidStatus(status: string): status is ScriptStatus {
  return validStatuses.includes(status as ScriptStatus);
}

const VALID_TRANSITIONS: Record<ScriptStatus, ScriptStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["approved", "rejected", "changes_requested", "overdue"],
  changes_requested: ["pending_review"],
  approved: ["closed"],
  rejected: ["pending_review", "draft"],
  overdue: ["pending_review", "escalated"],
  escalated: ["pending_review", "draft"],
  closed: ["draft"],
};

export function isValidStatusTransition(
  from: ScriptStatus,
  to: ScriptStatus
): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /disregard\s+(all\s+)?(previous|above|prior)/i,
  /you\s+are\s+now\s+/i,
  /new\s+instruction[s:]?\s/i,
  /^system:/im,
  /^assistant:/im,
  /^user:/im,
  /^###\s/m,
  /^---\s*$/m,
];

const MAX_FEEDBACK_LENGTH = 10_000;

export function sanitizeFeedback(input: string): string {
  let cleaned = input.slice(0, MAX_FEEDBACK_LENGTH);

  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}
