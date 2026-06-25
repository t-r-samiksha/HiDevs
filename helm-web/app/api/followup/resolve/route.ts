import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { escalation_id, action } = await req.json();

    if (!escalation_id || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "escalation_id and action (approve/reject) required" }, { status: 400 });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    const { error } = await supabase
      .from("escalation_logs")
      .update({
        status: newStatus,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", escalation_id);

    if (error) throw new Error(error.message);

    // If approved, also update the item's followup_sent_at
    if (action === "approve") {
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

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error: any) {
    console.error("Follow-up resolve error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
