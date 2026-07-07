import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mastra, followupRuns } from "@/lib/mastra";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

// POST /api/followup/draft — runs the real Mastra followupHitlWorkflow: the
// draft + Enkrypt policy steps execute, then the workflow SUSPENDS at the
// human-approval step. The suspended run is kept in memory (keyed by the
// escalation_logs id) so /api/followup/resolve can resume() it.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { item_id, tier = 1 } = body;

    if (!item_id) {
      return NextResponse.json({ error: "item_id is required" }, { status: 400 });
    }
    if (![1, 2, 3].includes(tier)) {
      return NextResponse.json({ error: "tier must be 1, 2, or 3" }, { status: 400 });
    }

    const { data: item, error } = await supabase.from("items").select("*").eq("id", item_id).single();
    if (error || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // ── Tier 3: flag immediately, no draft / no workflow ─────────────────────
    if (tier === 3) {
      const { data: log, error: logErr } = await supabase
        .from("escalation_logs")
        .insert({ item_id: item.id, tier: 3, drafted_text: null, status: "flagged", policy_passed: null })
        .select()
        .single();
      if (logErr) throw new Error(logErr.message);
      return NextResponse.json({
        escalation_id: log.id,
        tier: 3,
        needs_attention: true,
        item_text: item.text,
        owner: item.owner,
        message: `"${item.text.slice(0, 80)}" has been flagged as needing immediate attention.`,
      });
    }

    // ── Tier 2: look up the owner's manager to cc ────────────────────────────
    let managerName: string | null = null;
    if (tier === 2 && item.owner) {
      const { data: ownerUser } = await supabase
        .from("users")
        .select("manager_id, name")
        .eq("id", item.owner)
        .single();
      if (ownerUser?.manager_id) {
        const { data: manager } = await supabase
          .from("users")
          .select("name")
          .eq("id", ownerUser.manager_id)
          .single();
        managerName = manager?.name ?? null;
      }
    }

    const today = new Date().toISOString().split("T")[0];
    const daysOverdue = item.deadline_iso ? Math.max(0, daysBetween(item.deadline_iso, today)) : 0;

    // ── Run the HITL workflow: draft → policy check → SUSPEND ─────────────────
    const run = await mastra.getWorkflow("followupHitlWorkflow").createRun();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await run.start({
      inputData: {
        item_id: item.id,
        item_text: item.text,
        owner: item.owner || "the assignee",
        deadline: item.deadline_raw || item.deadline_iso || "not specified",
        days_overdue: daysOverdue,
        tier,
        manager_cc: managerName || undefined,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any;

    if (result.status === "failed") {
      throw new Error(result.error?.message || "Follow-up workflow failed during draft/policy");
    }

    const payload = result.suspendPayload ?? result.steps?.["human-approval"]?.suspendPayload ?? {};
    const draft: string = payload.draft ?? "";
    const policyPassed: boolean = payload.policy_passed ?? false;

    // Enkrypt Checkpoint 4 hard gate — a draft that fails policy never enters
    // the approval queue (and we drop the suspended run).
    if (!policyPassed) {
      return NextResponse.json(
        { error: "Follow-up draft failed policy check. Please revise manually.", policy_passed: false, draft },
        { status: 422 }
      );
    }

    const logRow = { item_id: item.id, tier, drafted_text: draft, status: "pending", policy_passed: true };
    let { data: log, error: logErr } = await supabase
      .from("escalation_logs")
      .insert({ ...logRow, run_id: run.runId })
      .select()
      .single();
    // Tolerate DBs where the run_id column hasn't been added yet.
    if (logErr && /run_id/.test(logErr.message)) {
      ({ data: log, error: logErr } = await supabase.from("escalation_logs").insert(logRow).select().single());
    }
    if (logErr) throw new Error(logErr.message);

    // Fast path: keep the suspended run in memory so resolve() can resume the
    // exact HITL run. (resolve also reconstructs from storage by run_id.)
    followupRuns.set(String(log.id), run);

    return NextResponse.json({
      escalation_id: log.id,
      run_id: run.runId,
      tier,
      draft,
      policy_passed: true,
      needs_attention: false,
      owner: item.owner,
      item_text: item.text,
      ...(tier === 2 && managerName ? { manager_cc: managerName } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Follow-up draft error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
