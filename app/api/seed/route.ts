import { NextResponse } from "next/server";
import { createServiceClientDirect } from "@/lib/supabase/server";
import { storeClientMemory } from "@/lib/agent/nodes/memoryUpdate";
import type { Client, Script } from "@/lib/supabase/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const seedSecret = process.env.SEED_SECRET_TOKEN;
  if (!seedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token =
    request.headers.get("x-seed-token") ??
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (token !== seedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase: SupabaseAny = createServiceClientDirect();

  await supabase.from("audit_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("chasers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("client_memories").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("scripts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("clients").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .insert([
      {
        name: "Sarah Chen",
        email: "ishaan.sinha10@gmail.com",
        company: "Nike",
        avg_response_hours: 12.5,
        total_scripts: 8,
        approved_count: 6,
        rejected_count: 1,
        changes_requested_count: 1,
        whatsapp_number: "+918340121267",
        preferred_channel: "both",
      },
      {
        name: "Marcus Weber",
        email: "marcus@adidas-demo.com",
        company: "Adidas",
        avg_response_hours: 72.0,
        total_scripts: 5,
        approved_count: 2,
        rejected_count: 1,
        changes_requested_count: 2,
        whatsapp_number: null,
        preferred_channel: "email",
      },
      {
        name: "Priya Patel",
        email: "priya@puma-demo.com",
        company: "Puma",
        avg_response_hours: 36.0,
        total_scripts: 4,
        approved_count: 3,
        rejected_count: 0,
        changes_requested_count: 1,
        whatsapp_number: null,
        preferred_channel: "email",
      },
    ])
    .select();

  if (clientsError || !clients) {
    return NextResponse.json(
      { error: `Failed to create clients: ${clientsError?.message}` },
      { status: 500 }
    );
  }

  const typedClients = clients as Client[];
  const [nike, adidas, puma] = typedClients;

  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000).toISOString();

  const { error: scriptsError } = await supabase.from("scripts").insert([
    {
      title: "Air Max Summer Campaign - Hero Video",
      content:
        "OPEN on a runner mid-stride at golden hour.\n\nVO: \"Every step tells a story.\"\n\nCUT TO close-up of Air Max sole flexing on impact.\n\nVO: \"The new Air Max Pulse. Engineered for the stories you haven't written yet.\"\n\nMONTAGE: diverse athletes in urban and trail settings.\n\nSUPER: Air Max Pulse. Your Story. Your Sole.\n\nEND CARD: Nike swoosh + release date.",
      client_id: nike.id,
      status: "pending_review",
      sent_at: hoursAgo(6),
      due_date: hoursAgo(-42),
      expires_at: daysFromNow(7),
      version: 1,
      platform: "instagram",
      assigned_writer: "Alex Kim",
    },
    {
      title: "Adidas Originals - Retro Revival TVC",
      content:
        "OPEN on a vinyl record spinning.\n\nSFX: Needle drop, funk beat kicks in.\n\nCUT TO street dancer wearing Adidas Originals, moves synced to beat.\n\nVO: \"Some things never go out of style.\"\n\nMONTAGE: Archive footage mixed with modern street culture.\n\nVO: \"Adidas Originals. Forever classic. Forever fresh.\"\n\nEND CARD: Trefoil logo + tagline.",
      client_id: adidas.id,
      status: "pending_review",
      sent_at: hoursAgo(72),
      due_date: hoursAgo(24),
      expires_at: daysFromNow(5),
      version: 1,
      platform: "youtube",
      assigned_writer: "Jordan Rivers",
    },
    {
      title: "Puma x F1 - Speed Meets Style",
      content:
        "OPEN on F1 car cockpit POV, engine roar.\n\nCUT TO driver stepping out, camera reveals Puma racing boots transitioning to Puma sneakers.\n\nVO: \"From the track to the street. Speed is a mindset.\"\n\nMONTAGE: Race footage intercut with urban lifestyle.\n\nSUPER: Puma x F1 Collection. Available Now.\n\nEND CARD: Puma logo.",
      client_id: puma.id,
      status: "approved",
      sent_at: hoursAgo(96),
      reviewed_at: hoursAgo(48),
      due_date: hoursAgo(48),
      expires_at: daysFromNow(3),
      version: 1,
      platform: "youtube",
      assigned_writer: "Sam Lee",
    },
    {
      title: "Nike Running - Marathon Stories",
      content:
        "COLD OPEN: Alarm clock hits 4:30 AM.\n\nFolllow three real marathon runners through training.\n\nVO (Runner 1): \"People ask why I run at 4 AM. I ask why they don't.\"\n\nINTERCUT training montages with personal moments - breakfast with family, work commute, late night stretches.\n\nVO: \"The marathon isn't 26.2 miles. It's every mile before that.\"\n\nEND CARD: Nike Running. Just Do It.",
      client_id: nike.id,
      status: "changes_requested",
      client_feedback: "Love the concept but the tone feels too serious. Can we add more energy and a sense of community? Also the 4 AM angle has been done before.",
      sent_at: hoursAgo(30),
      reviewed_at: hoursAgo(18),
      due_date: hoursAgo(-18),
      expires_at: daysFromNow(6),
      version: 1,
      platform: "instagram",
      assigned_writer: "Alex Kim",
    },
    {
      title: "Adidas Ultraboost - City Runners",
      content:
        "OPEN on empty city streets at dawn.\n\nSFX: Single pair of footsteps, then multiplying.\n\nWIDE SHOT reveals hundreds of runners converging.\n\nVO: \"The city is your track. Every block a new PR.\"\n\nMONTAGE: Runners in Tokyo, London, New York.\n\nSUPER: Ultraboost 24. Run the City.\n\nEND CARD: Adidas three stripes.",
      client_id: adidas.id,
      status: "pending_review",
      sent_at: hoursAgo(55),
      due_date: hoursAgo(7),
      expires_at: daysFromNow(4),
      version: 1,
      platform: "linkedin",
      assigned_writer: "Jordan Rivers",
    },
    {
      title: "Puma Lifestyle - Weekend Edit",
      content:
        "No VO. Music-driven spot.\n\nSOUNDTRACK: Lo-fi hip hop beat.\n\nVIGNETTES: Saturday morning coffee in Puma slides. Skateboard session in Puma Suedes. Rooftop hangout at sunset.\n\nTEXT CARDS between scenes: \"Weekend mode.\" \"No rules.\" \"Just vibes.\"\n\nEND CARD: Puma Lifestyle. Do You.",
      client_id: puma.id,
      status: "rejected",
      client_feedback: "This doesn't align with our brand direction for Q2. We're moving away from lo-fi aesthetics. Need something more premium and aspirational.",
      sent_at: hoursAgo(120),
      reviewed_at: hoursAgo(100),
      due_date: hoursAgo(72),
      expires_at: daysFromNow(1),
      version: 1,
      platform: "instagram",
      assigned_writer: "Sam Lee",
    },
  ] as Partial<Script>[]);

  if (scriptsError) {
    return NextResponse.json(
      { error: `Failed to create scripts: ${scriptsError.message}` },
      { status: 500 }
    );
  }

  const starterMemories: { clientId: string; name: string; company: string; channel: string; avgHours: number }[] = [
    { clientId: nike.id, name: "Sarah Chen", company: "Nike", channel: "both (email + WhatsApp)", avgHours: 12.5 },
    { clientId: adidas.id, name: "Marcus Weber", company: "Adidas", channel: "email", avgHours: 72 },
    { clientId: puma.id, name: "Priya Patel", company: "Puma", channel: "email", avgHours: 36 },
  ];

  const memoryResults = { stored: 0, failed: 0 };

  for (const m of starterMemories) {
    const content = `Client ${m.name} for brand ${m.company}. Preferred contact: ${m.channel}. ` +
      `Typical response time: ${m.avgHours} hours. ` +
      `Brand style: short-form video content for social media.`;

    try {
      await storeClientMemory(m.clientId, content, "behavioral_pattern", { source: "seed" });
      memoryResults.stored++;
    } catch (err) {
      console.error(`[seed] Failed to store starter memory for ${m.name}:`, err);
      memoryResults.failed++;
    }
  }

  const historicalMemories: { clientId: string; content: string; type: "approval" | "rejection" | "feedback" }[] = [
    {
      clientId: nike.id,
      content: `Client Sarah Chen approved script "Nike Air Force 1 - Street Culture" in 8 hours. Quick turnaround, minimal feedback.`,
      type: "approval",
    },
    {
      clientId: nike.id,
      content: `Client Sarah Chen requested changes on "Nike Dunk Low - Skate Origins". Feedback: "Too retro, needs modern edge." Response time: 14 hours.`,
      type: "feedback",
    },
    {
      clientId: adidas.id,
      content: `Client Marcus Weber rejected script "Adidas Forum - Basketball Heritage". Reason: "Doesn't align with Q3 campaign direction." Response time: 96 hours. Slow responder.`,
      type: "rejection",
    },
    {
      clientId: adidas.id,
      content: `Client Marcus Weber approved script "Adidas Samba - Dance Floor" after 3 days. Required two follow-ups before responding.`,
      type: "approval",
    },
    {
      clientId: puma.id,
      content: `Client Priya Patel approved script "Puma RS-X - Tech Runner" in 24 hours. Comment: "Love it, ship it." Generally responsive.`,
      type: "approval",
    },
  ];

  for (const mem of historicalMemories) {
    try {
      await storeClientMemory(mem.clientId, mem.content, mem.type, { source: "seed" });
      memoryResults.stored++;
    } catch (err) {
      console.error("[seed] Failed to store historical memory:", err);
      memoryResults.failed++;
    }
  }

  return NextResponse.json({
    success: true,
    created: { clients: typedClients.length, scripts: 6 },
    memories: memoryResults,
  });
}
