import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/requireSession";
import { consolidateClientMemories } from "@/lib/agent/nodes/memoryConsolidate";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const { id } = await params;

  try {
    const result = await consolidateClientMemories(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Consolidation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
