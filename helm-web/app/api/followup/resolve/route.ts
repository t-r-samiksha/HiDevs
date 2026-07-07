import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mastra, followupRuns, type FollowupRun } from "@/lib/mastra";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/followup/resolve — records the decision AND resumes the suspended
// Mastra HITL run with { approved }, completing real suspend/resume. The DB
// update keeps the approval queue working even if the run is no longer in
// memory (e.g. after a server restart).
export async function POST(req: NextRequest) {
  try {
    const { escalation_id, action } = await req.json();
    if (!escalation_id || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "escalation_id and action (approve/reject) required" },
        { status: 400 }
      );
    }

    const approved = action === "approve";
    const newStatus = approved ? "approved" : "rejected";

    const { error } = await supabase
      .from("escalation_logs")
      .update({ status: newStatus, resolved_at: new Date().toISOString() })
      .eq("id", escalation_id);
    if (error) throw new Error(error.message);

    if (approved) {
      const { data: log } = await supabase
        .from("escalation_logs")
        .select("item_id")
        .eq("id", escalation_id)
        .single();
      if (log) {
        await supabase
          .from("items")
          .update({ followup_sent_at: new Date().toISOString() })
          .eq("id", log.item_id);
      }
    }

    // Resume the exact suspended HITL run this draft created. Fast path: the
    // in-memory run. Durable path: reconstruct from LibSQL storage by run_id.
    let resumed = false;
    let run: FollowupRun | undefined = followupRuns.get(String(escalation_id));
    if (!run) {
      const { data: log } = await supabase
        .from("escalation_logs")
        .select("run_id")
        .eq("id", escalation_id)
        .single();
      if (log?.run_id) {
        try {
          run = await mastra.getWorkflow("followupHitlWorkflow").createRun({ runId: log.run_id });
        } catch (e) {
          console.error("HITL run reconstruction failed:", e);
        }
      }
    }
    if (run) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (run as any).resume({ step: "human-approval", resumeData: { approved } });
        resumed = true;
      } catch (e) {
        console.error("HITL resume failed:", e);
      }
      followupRuns.delete(String(escalation_id));
    }

    return NextResponse.json({ success: true, status: newStatus, resumed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Follow-up resolve error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
