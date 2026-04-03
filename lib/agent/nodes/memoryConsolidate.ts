import Anthropic from "@anthropic-ai/sdk";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { generateEmbedding } from "./ragRetrieval";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

const CONSOLIDATION_THRESHOLD = 20;
const SUMMARY_TARGET_COUNT = 6;
const CONSOLIDATION_MODEL = "claude-3-5-haiku-latest";
const CONSOLIDATION_MAX_TOKENS = 1024;

interface ConsolidationResult {
  consolidated: boolean;
  entryCount?: number;
}

interface MemoryEntry {
  id: string;
  memory_type: string;
  content: string;
}

function isValidSummaryArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  return value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0);
}

function buildConsolidationPrompt(entries: MemoryEntry[]): string {
  const formatted = entries
    .map((e, i) => `${i + 1}. [${e.memory_type}] ${e.content}`)
    .join("\n");

  return (
    `Here are ${entries.length} memory entries about a client. ` +
    `Summarize them into exactly ${SUMMARY_TARGET_COUNT} concise, factual statements. ` +
    `Each statement should be actionable for someone writing a follow-up email to this client. ` +
    `Return ONLY a JSON array of strings.\n\n` +
    `Entries:\n${formatted}\n\nJSON array:`
  );
}

async function fetchClientMemories(
  supabase: SupabaseAny,
  clientId: string
): Promise<MemoryEntry[]> {
  const { data, error } = await supabase
    .from("client_memories")
    .select("id, memory_type, content")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Fetch memories failed: ${error.message}`);
  return data as MemoryEntry[];
}

async function summarizeEntries(entries: MemoryEntry[]): Promise<string[]> {
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: CONSOLIDATION_MODEL,
    max_tokens: CONSOLIDATION_MAX_TOKENS,
    messages: [{ role: "user", content: buildConsolidationPrompt(entries) }],
  });

  // C3: Guard response.content array access
  if (!response.content || response.content.length === 0) {
    throw new Error("LLM returned empty content array");
  }

  const block = response.content[0];
  const text = block.type === "text" ? block.text : "";

  // C1: Wrap JSON.parse in try-catch
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[memoryConsolidate] Failed to parse LLM response:", text.slice(0, 500));
    throw new Error("LLM returned non-JSON response");
  }

  // A1: Validate shape
  if (!isValidSummaryArray(parsed)) {
    console.error("[memoryConsolidate] Invalid shape or empty array from LLM:", JSON.stringify(parsed).slice(0, 500));
    throw new Error("LLM returned invalid or empty summary array");
  }

  return parsed;
}

async function insertConsolidatedMemory(
  supabase: SupabaseAny,
  clientId: string,
  content: string,
  originalCount: number
): Promise<void> {
  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(content);
  } catch {
    console.warn("[memory] Embedding failed for consolidated entry");
  }

  const { error } = await supabase.from("client_memories").insert({
    client_id: clientId,
    content,
    embedding,
    memory_type: "behavioral_pattern",
    metadata: { source: "consolidation", original_count: originalCount },
  });

  if (error) throw new Error(`Insert consolidated memory failed: ${error.message}`);
}

export async function consolidateClientMemories(
  clientId: string
): Promise<ConsolidationResult> {
  const supabase: SupabaseAny = createServiceClientDirect();

  try {
    const entries = await fetchClientMemories(supabase, clientId);

    if (entries.length <= CONSOLIDATION_THRESHOLD) {
      return { consolidated: false };
    }

    const summaries = await summarizeEntries(entries);

    // Fix 3: Insert consolidated FIRST, confirm success, THEN delete originals
    const originalCount = entries.length;
    for (const summary of summaries) {
      await insertConsolidatedMemory(supabase, clientId, summary, originalCount);
    }

    // Only delete originals after all inserts succeeded
    const originalIds = entries.map((e) => e.id);
    const { error: deleteError } = await supabase
      .from("client_memories")
      .delete()
      .in("id", originalIds);

    if (deleteError) {
      console.error(`[memoryConsolidate] client=${clientId} Delete failed after insert:`, deleteError.message);
      // Inserts succeeded but delete failed — originals remain alongside consolidated.
      // This is safe: duplicates are better than data loss.
    }

    return { consolidated: true, entryCount: summaries.length };
  } catch (err) {
    // Fix 13: Log with client ID for operator visibility
    const message = err instanceof Error ? err.message : "Unknown consolidation error";
    console.error(`[memoryConsolidate] client=${clientId} Consolidation failed:`, message);
    return { consolidated: false };
  }
}
