import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { followupRuns, type FollowupRun } from "@/lib/mastra";
import { sendEmail } from "@/lib/mailer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Resolve the owner's email for a follow-up. Prefers the item's own owner_email
// (populated at extraction time when the column exists), then falls back to a
// case-insensitive name match against the users table so email works even
// without the owner_email column.
async function resolveOwnerEmail(item: {
  owner?: string | null;
  owner_email?: string | null;
}): Promise<string | null> {
  if (item.owner_email) return item.owner_email;
  if (!item.owner) return null;
  const { data } = await supabase
    .from("users")
    .select("email")
    .ilike("name", item.owner)
    .limit(1);
  return data?.[0]?.email ?? null;
}

// POST /api/followup/resolve — records the decision in escalation_logs and,
// when the suspended Mastra HITL run is still in memory (same server
// instance as the draft call), resumes it with { approved }. See the note
// above the resume block for why only the in-memory path is attempted.
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

    // On approve, actually deliver the drafted nudge: pull the draft + owner,
    // resolve the owner's email, and send it (lib/mailer falls back to a
    // console log if RESEND_API_KEY isn't set). Status becomes "sent" when an
    // email went out, otherwise "approved" (approval logged, no email on file).
    let emailSent = false;
    let sentTo: string | null = null;

    if (approved) {
      const { data: log } = await supabase
        .from("escalation_logs")
        .select("item_id, drafted_text")
        .eq("id", escalation_id)
        .single();

      if (log) {
        const { data: item } = await supabase
          .from("items")
          .select("text, owner")
          .eq("id", log.item_id)
          .single();

        sentTo = item ? await resolveOwnerEmail(item) : null;

        if (sentTo && log.drafted_text) {
          const subject = `Follow-up: ${(item?.text || "an action item").slice(0, 60)}`;
          const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1c2029">
  <p>Hi ${item?.owner || "there"},</p>
  <p>${log.drafted_text.replace(/\n/g, "<br/>")}</p>
  <p style="color:#6b7280;font-size:12px;margin-top:20px">Sent via Helm — your team's meeting command center.</p>
</div>`;
          emailSent = await sendEmail(sentTo, subject, html);
        }

        await supabase
          .from("items")
          .update({ followup_sent_at: new Date().toISOString() })
          .eq("id", log.item_id);
      }
    }

    const newStatus = approved ? (emailSent ? "sent" : "approved") : "rejected";

    const { error } = await supabase
      .from("escalation_logs")
      .update({ status: newStatus, resolved_at: new Date().toISOString() })
      .eq("id", escalation_id);
    if (error) throw new Error(error.message);

    // Resume the exact suspended HITL run this draft created. Only the
    // in-memory fast path can actually work: /api/followup/draft and this
    // route run as separate Vercel serverless invocations with no shared
    // memory, and LibSQLStore's "file:./helm-mastra.db" doesn't survive
    // across invocations on Vercel's ephemeral/read-only filesystem either
    // — so reconstructing the run from storage by run_id never finds real
    // suspended state there, and resume() always throws "not suspended."
    // That fallback was pure dead weight (an extra Supabase round-trip + a
    // guaranteed-failing Mastra call on every approve/reject), so it's
    // dropped. The approval decision is still durably recorded in
    // escalation_logs regardless of whether the in-memory resume succeeds.
    let resumed = false;
    const run: FollowupRun | undefined = followupRuns.get(String(escalation_id));
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

    return NextResponse.json({ success: true, status: newStatus, resumed, email_sent: emailSent, sent_to: sentTo });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Follow-up resolve error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
