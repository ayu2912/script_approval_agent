import { createServiceClientDirect } from "@/lib/supabase/server";
import { generateEmbedding } from "./ragRetrieval";
import { consolidateClientMemories } from "./memoryConsolidate";
import type { MemoryType } from "@/lib/supabase/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function storeClientMemory(
  clientId: string,
  content: string,
  memoryType: MemoryType,
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase: SupabaseAny = createServiceClientDirect();

  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(content);
  } catch {
    console.warn("[WARN] Embedding failed — memory stored without vector");
  }

  const { error } = await supabase.from("client_memories").insert({
    client_id: clientId,
    content,
    embedding,
    memory_type: memoryType,
    metadata: metadata ?? null,
  });

  if (error) {
    console.error("[memory] Failed to store memory:", error.message);
  }

  consolidateClientMemories(clientId).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[memory] client=${clientId} Consolidation check failed:`, message);
  });
}

export function buildMemoryContent(
  action: "approved" | "rejected" | "changes_requested",
  scriptTitle: string,
  feedback: string | null
): string {
  switch (action) {
    case "approved":
      return `Approved script "${scriptTitle}".${feedback ? ` Comment: ${feedback}` : ""}`;
    case "rejected":
      return `Rejected script "${scriptTitle}".${feedback ? ` Reason: ${feedback}` : ""}`;
    case "changes_requested":
      return `Requested changes on "${scriptTitle}".${feedback ? ` Feedback: ${feedback}` : ""}`;
  }
}

export function actionToMemoryType(action: "approved" | "rejected" | "changes_requested"): MemoryType {
  switch (action) {
    case "approved": return "approval";
    case "rejected": return "rejection";
    case "changes_requested": return "feedback";
  }
}

export function buildChaserSentMemory(opts: {
  clientName: string;
  brand: string | null;
  scriptTitle: string;
  platform: string | null;
  daysOverdue: number;
  critiqueScores?: { professionalism?: number; personalization?: number } | null;
  wasEdited: boolean;
}): string {
  const brandStr = opts.brand ? ` for brand ${opts.brand}` : "";
  const platformStr = opts.platform ? ` on ${opts.platform}` : "";
  const toneStr = opts.critiqueScores?.professionalism != null
    ? `${opts.critiqueScores.professionalism}/10`
    : "unknown";
  const personStr = opts.critiqueScores?.personalization != null
    ? `${opts.critiqueScores.personalization}/10`
    : "unknown";
  const editNote = opts.wasEdited ? " Team lead edited the draft before sending." : "";

  return `Client ${opts.clientName}${brandStr}: Script titled "${opts.scriptTitle}"${platformStr}. ` +
    `Chaser sent after ${opts.daysOverdue} days overdue. ` +
    `Chaser tone: ${toneStr}. ` +
    `Chaser personalisation score: ${personStr}. ` +
    `Agent outcome: chaser approved by team lead and sent.${editNote}`;
}

export function buildClientResponseMemory(opts: {
  clientName: string;
  scriptTitle: string;
  intent: string;
  feedback: string | null;
  responseHours: number | null;
  channel: string;
}): string {
  const feedbackStr = opts.feedback ? ` Feedback: "${opts.feedback}".` : "";
  const timeStr = opts.responseHours != null
    ? `${Math.round(opts.responseHours)} hours`
    : "unknown";

  return `Client ${opts.clientName} responded to script "${opts.scriptTitle}" ` +
    `with decision: ${opts.intent}.${feedbackStr} ` +
    `Response time: ${timeStr}. ` +
    `Channel: ${opts.channel}.`;
}
