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

    // FIX 2 — enrich the draft with context the workflow prompt reads off the
    // existing inputData fields (item_text + deadline), since the prompt itself
    // lives inside the workflow and isn't edited here.
    let meetingLabel = "";
    if (item.meeting_id) {
      const { data: meeting } = await supabase
        .from("meetings")
        .select("title, date")
        .eq("id", item.meeting_id)
        .single();
      if (meeting?.title) {
        const when = meeting.date ? ` on ${String(meeting.date).split("T")[0]}` : "";
        meetingLabel = ` (agreed in "${meeting.title}"${when})`;
      }
    }
    const deps: string[] = Array.isArray(item.dependency_hints) ? item.dependency_hints : [];
    const enrichedText = deps.length ? `${item.text} — blocked on: ${deps.join(", ")}` : item.text;
    const enrichedDeadline = `${item.deadline_raw || item.deadline_iso || "not specified"}${meetingLabel}`;

    // Owner email (matched by name) so the UI can offer a "Send via email"
    // option when a real inbox + Resend key are available.
    let ownerEmail: string | null = null;
    if (item.owner) {
      const { data: ownerRow } = await supabase
        .from("users")
        .select("email")
        .ilike("name", item.owner)
        .limit(1);
      ownerEmail = ownerRow?.[0]?.email ?? null;
    }
    const canEmail = !!ownerEmail && !!process.env.RESEND_API_KEY;

    // ── Run the HITL workflow: draft → policy check → SUSPEND ─────────────────
    const run = await mastra.getWorkflow("followupHitlWorkflow").createRun();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await run.start({
      inputData: {
        item_id: item.id,
        item_text: enrichedText,
        owner: item.owner || "the assignee",
        deadline: enrichedDeadline,
        days_overdue: daysOverdue,
        tier,
        manager_cc: managerName || undefined,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any;

    if (result.status === "failed") {
      throw new Error(result.error?.message || "Follow-up workflow failed during draft/policy");
    }

    // Mastra exposes the suspend payload both at the top level and under the
    // suspended step — but the top-level copy can be an empty {} while the real
    // one (with draft + policy_passed) lives on steps["human-approval"]. Merge,
    // letting the step-level payload win, so we never read the empty shell.
    const stepPayload = result.steps?.["human-approval"]?.suspendPayload ?? {};
    const topPayload = result.suspendPayload ?? {};
    const payload = { ...topPayload, ...stepPayload };
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
      owner_email: ownerEmail,
      can_email: canEmail,
      item_text: item.text,
      ...(tier === 2 && managerName ? { manager_cc: managerName } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Follow-up draft error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
