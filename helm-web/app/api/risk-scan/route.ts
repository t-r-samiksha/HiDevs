import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mastra } from "@/lib/mastra";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// FIX 5 — after a scan, make sure the approval queue is never empty for the
// demo: draft a follow-up for the first at-risk item that doesn't already have
// a pending one. Best-effort — never fails the scan.
async function ensurePendingFollowup(origin: string): Promise<string | null> {
  try {
    const { data: atRisk } = await supabase
      .from("items")
      .select("id")
      .in("status", ["at_risk", "blocked"])
      .order("deadline_iso", { ascending: true })
      .limit(20);
    if (!atRisk?.length) return null;

    const { data: pending } = await supabase
      .from("escalation_logs")
      .select("item_id")
      .eq("status", "pending");
    const alreadyQueued = new Set((pending || []).map((p) => p.item_id));

    const target = atRisk.find((i) => !alreadyQueued.has(i.id));
    if (!target) return null;

    const res = await fetch(`${origin}/api/followup/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: target.id, tier: 1 }),
    });
    return res.ok ? target.id : null;
  } catch (e) {
    console.error("Auto follow-up after risk scan failed:", e);
    return null;
  }
}

// Executes the real Mastra riskMonitorWorkflow (createWorkflow/createStep) rather
// than inline logic. The workflow adds the silence+deadline rule.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const run = await mastra.getWorkflow("riskMonitorWorkflow").createRun();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await run.start({ inputData: { simulate_date: body.simulate_date } })) as any;

    if (result.status === "success") {
      const auto_followup_item = await ensurePendingFollowup(req.nextUrl.origin);
      return NextResponse.json({ ...result.result, auto_followup_item });
    }
    return NextResponse.json(
      { error: "Risk monitor workflow did not complete", status: result.status },
      { status: 500 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Risk scan error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
