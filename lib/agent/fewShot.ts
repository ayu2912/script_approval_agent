import { createServiceClientDirect } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export interface FewShotExample {
  original_draft: string;
  edited_draft: string;
  script_title: string | null;
  tone: string | null;
}

export async function storeFewShotExample(params: {
  clientId: string;
  chaserId: string;
  originalDraft: string;
  editedDraft: string;
  scriptTitle: string | null;
  tone?: string | null;
}): Promise<void> {
  const supabase: SupabaseAny = createServiceClientDirect();

  // Fix 8: Deduplicate — check if example exists for same chaser, update if so
  const { data: existing } = await supabase
    .from("chaser_few_shot_examples")
    .select("id")
    .eq("chaser_id", params.chaserId)
    .limit(1);

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from("chaser_few_shot_examples")
      .update({
        original_draft: params.originalDraft,
        edited_draft: params.editedDraft,
        script_title: params.scriptTitle,
        tone: params.tone ?? null,
      })
      .eq("id", existing[0].id);

    if (error) {
      console.error("[fewShot] Failed to update example:", error.message);
      throw error;
    }
    return;
  }

  const { error } = await supabase.from("chaser_few_shot_examples").insert({
    client_id: params.clientId,
    chaser_id: params.chaserId,
    original_draft: params.originalDraft,
    edited_draft: params.editedDraft,
    script_title: params.scriptTitle,
    tone: params.tone ?? null,
  });

  if (error) {
    console.error("[fewShot] Failed to store example:", error.message);
    throw error;
  }
}

export async function getFewShotExamples(
  clientId: string,
  limit = 3
): Promise<FewShotExample[]> {
  const supabase: SupabaseAny = createServiceClientDirect();

  const { data, error } = await supabase
    .from("chaser_few_shot_examples")
    .select("original_draft, edited_draft, script_title, tone")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[fewShot] Failed to fetch examples:", error.message);
    return [];
  }

  return data ?? [];
}
