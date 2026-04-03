import { OpenAIEmbeddings } from "@langchain/openai";
import { createServiceClientDirect } from "@/lib/supabase/server";
import type { ApprovalState } from "../../approvalTypes";
import type { NodeLogEntry } from "../../types";

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  openAIApiKey: process.env.OPENAI_API_KEY,
});

export async function fetchClientMemory(
  state: ApprovalState
): Promise<Partial<ApprovalState>> {
  const start = Date.now();

  // If no clientId yet (fetchContext failed), skip gracefully
  if (!state.clientId) {
    return { clientMemories: [] };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServiceClientDirect() as any;

    const query = `approval follow-up communication style for ${state.clientName} regarding script ${state.scriptTitle}`;
    const queryEmbedding = await embeddings.embedQuery(query);

    const { data: memories } = await supabase.rpc("match_client_memories", {
      query_embedding: queryEmbedding,
      match_client_id: state.clientId,
      match_count: 5,
    });

    const memoryTexts: string[] = (memories ?? []).map(
      (m: { content: string }) => m.content
    );

    const log: NodeLogEntry = {
      node: "fetchClientMemory",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      summary: `Retrieved ${memoryTexts.length} memory entries for ${state.clientName}`,
    };

    return { clientMemories: memoryTexts, nodeLog: [log] };
  } catch (err) {
    // Non-fatal — proceed without memory context
    console.warn("[fetchClientMemory] RAG failed, proceeding without context:", err);
    return { clientMemories: [] };
  }
}
