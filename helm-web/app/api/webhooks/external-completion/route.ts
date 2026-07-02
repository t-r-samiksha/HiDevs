import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ATTRIBUTION_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours

// POST /api/webhooks/external-completion
// Body: { item_id, external_tool, external_id, status }
// Called by Jira/Linear/etc. when an issue linked to a Helm item is completed.
export async function POST(req: NextRequest) {
  try {
    const { item_id, external_tool, external_id, status } = await req.json();
    if (!item_id) {
      return NextResponse.json({ error: "item_id is required" }, { status: 400 });
    }

    const { data: item, error: fetchErr } = await supabase
      .from("items")
      .select("id, status, owner")
      .eq("id", item_id)
      .single();

    if (fetchErr || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const newStatus =
      status === "done" || status === "completed" || status === "closed"
        ? "done"
        : status || "done";

    await supabase.from("items").update({ status: newStatus }).eq("id", item_id);

    // Resolve pending follow-ups and check attribution window
    const { data: resolvedLogs } = await supabase
      .from("escalation_logs")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("item_id", item_id)
      .eq("status", "pending")
      .select("id, created_at");

    const now = Date.now();
    const followupAttributed = (resolvedLogs || []).some(
      (log) => now - new Date(log.created_at).getTime() < ATTRIBUTION_WINDOW_MS
    );

    // Update owner profile avg close time if a follow-up was sent
    if (followupAttributed && item.owner) {
      const sentLog = (resolvedLogs || []).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )[0];
      const closeTimeDays =
        (now - new Date(sentLog.created_at).getTime()) / (1000 * 60 * 60 * 24);

      const { data: ownerUser } = await supabase
        .from("users")
        .select("id")
        .eq("name", item.owner)
        .single();

      if (ownerUser) {
        const { data: profile } = await supabase
          .from("owner_profiles")
          .select("avg_close_time_tier1")
          .eq("user_id", ownerUser.id)
          .single();

        const newAvg = profile?.avg_close_time_tier1
          ? (profile.avg_close_time_tier1 + closeTimeDays) / 2
          : closeTimeDays;

        await supabase
          .from("owner_profiles")
          .upsert(
            { user_id: ownerUser.id, avg_close_time_tier1: newAvg, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
      }
    }

    // Audit log
    await supabase
      .from("audit_logs")
      .insert({
        change_type: "external_completion",
        entity: item_id,
        new_value: { external_tool, external_id, status: newStatus },
        driving_signal: followupAttributed ? "followup_attribution" : "direct_completion",
        triggered_by: external_tool || "webhook",
      });

    return NextResponse.json({
      ok: true,
      item_id,
      new_status: newStatus,
      followup_attributed: followupAttributed,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
