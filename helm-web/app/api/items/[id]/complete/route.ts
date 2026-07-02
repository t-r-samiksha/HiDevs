import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/items/[id]/complete — mark an item as done
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify item exists
    const { data: item, error: fetchErr } = await supabase
      .from("items")
      .select("id, status")
      .eq("id", id)
      .single();

    if (fetchErr || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (item.status === "done") {
      return NextResponse.json({ ok: true, message: "Already completed" });
    }

    // Fetch owner before marking done (needed for profile update)
    const { data: fullItem } = await supabase
      .from("items")
      .select("owner")
      .eq("id", id)
      .single();

    // Mark item done (no updated_at column in items table)
    const { error: updateErr } = await supabase
      .from("items")
      .update({ status: "done" })
      .eq("id", id);

    if (updateErr) throw new Error(updateErr.message);

    // Resolve any pending follow-up logs for this item
    const { data: resolvedLogs } = await supabase
      .from("escalation_logs")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("item_id", id)
      .eq("status", "pending")
      .select("id, created_at");

    // Mark any unsent reminders as sent (no longer needed)
    await supabase
      .from("reminders")
      .update({ sent: true })
      .eq("item_id", id)
      .eq("sent", false);

    // Update owner profile avg close time if a follow-up drove this completion
    const sentLog = (resolvedLogs || []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];

    if (sentLog && fullItem?.owner) {
      const closeTimeDays =
        (Date.now() - new Date(sentLog.created_at).getTime()) / (1000 * 60 * 60 * 24);

      const { data: ownerUser } = await supabase
        .from("users")
        .select("id")
        .eq("name", fullItem.owner)
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

    return NextResponse.json({ ok: true, item_id: id, status: "done" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
