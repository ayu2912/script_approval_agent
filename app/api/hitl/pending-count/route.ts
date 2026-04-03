import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function GET() {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const supabase: SupabaseAny = createServiceClientDirect();

  const { count, error } = await supabase
    .from("chasers")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_hitl");

  if (error) {
    console.error("[hitl/pending-count] Query failed:", error.message);
    return NextResponse.json({ error: "Failed to query pending count" }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
