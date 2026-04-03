import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { createClient as createClientInDb } from "@/lib/clients/createClient";
import type { Client } from "@/lib/supabase/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function GET(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "200", 10) || 200, 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

  const supabase = createServiceClientDirect();

  const { data, error } = await (supabase as SupabaseAny)
    .from("clients")
    .select("*")
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[clients/GET] Query failed:", error.message);
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }

  return NextResponse.json(data as Client[]);
}

export async function POST(request: Request) {
  const { error: authError } = await requireSession();
  if (authError) return authError;

  const body = await request.json();
  const { name, email, company, whatsapp, preferred_channel } = body as {
    name: string;
    email: string;
    company?: string;
    whatsapp?: string;
    preferred_channel?: string;
  };

  const result = await createClientInDb({
    name,
    email,
    company: company ?? null,
    whatsapp_number: whatsapp ?? null,
    preferred_channel,
  });

  if (result.error) {
    const status = result.error === "Invalid email address" || result.error.includes("required") ? 400 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result.client as unknown as Client, { status: 201 });
}
