import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;
  const { draft_content } = (await request.json()) as { draft_content: string };

  if (!draft_content) {
    return NextResponse.json({ error: "draft_content is required" }, { status: 400 });
  }

  const supabase: SupabaseAny = createServiceClientDirect();

  const { error } = await supabase
    .from("chasers")
    .update({ draft_content })
    .eq("id", id);

  if (error) {
    console.error("[hitl/draft] Update failed:", error.message);
    return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
