import { NextRequest, NextResponse } from "next/server";
import { mastra } from "@/lib/mastra-instance";

// POST /api/workflows/followup — executes the real Mastra HITL followup workflow.
// It drafts a nudge, runs the Enkrypt policy check, then SUSPENDS at the
// human-approval step; the suspend payload (draft) + runId are returned so a
// second call could resume() it. (Additive; does not touch /api/followup/*.)
//
// Body: { item_id, item_text, owner, deadline, days_overdue, tier?, manager_cc? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body.item_text || !body.owner) {
      return NextResponse.json({ error: "item_text and owner are required" }, { status: 400 });
    }
    const run = await mastra.getWorkflow("followupHitlWorkflow").createRun();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await run.start({
      inputData: {
        item_id: body.item_id ?? "adhoc",
        item_text: body.item_text,
        owner: body.owner,
        deadline: body.deadline ?? "not specified",
        days_overdue: Number(body.days_overdue ?? 0),
        tier: Number(body.tier ?? 1),
        manager_cc: body.manager_cc,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any;

    if (result.status === "failed") {
      return NextResponse.json({ error: result.error?.message || "workflow failed" }, { status: 500 });
    }
    const payload = result.suspendPayload ?? result.steps?.["human-approval"]?.suspendPayload ?? {};
    return NextResponse.json({
      status: result.status,
      run_id: run.runId,
      draft: payload.draft ?? null,
      policy_passed: payload.policy_passed ?? null,
      message: payload.message ?? null,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}
