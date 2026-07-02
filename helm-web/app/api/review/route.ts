import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { item_id, action, text } = await req.json();

    if (!item_id || !["accept", "edit", "discard"].includes(action)) {
      return NextResponse.json(
        { error: "item_id and action (accept | edit | discard) required" },
        { status: 400 }
      );
    }

    if (action === "accept") {
      const { error } = await supabase
        .from("items")
        .update({ review_state: "auto" })
        .eq("id", item_id);
      if (error) throw new Error(error.message);
      await supabase.from("audit_logs").insert({
        change_type: "eval_positive_example",
        entity: item_id,
        triggered_by: "review_queue",
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "edit") {
      const trimmed = (text ?? "").trim();
      if (!trimmed) {
        return NextResponse.json({ error: "text is required for edit" }, { status: 400 });
      }
      const { data: before } = await supabase
        .from("items")
        .select("text")
        .eq("id", item_id)
        .single();
      const { error } = await supabase
        .from("items")
        .update({ text: trimmed, review_state: "auto" })
        .eq("id", item_id);
      if (error) throw new Error(error.message);
      await supabase.from("audit_logs").insert({
        change_type: "eval_soft_negative",
        entity: item_id,
        old_value: { text: before?.text ?? null },
        new_value: { text: trimmed },
        triggered_by: "review_queue",
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "discard") {
      // FK order: escalation_logs → items
      await supabase.from("escalation_logs").delete().eq("item_id", item_id);
      const { error } = await supabase.from("items").delete().eq("id", item_id);
      if (error) throw new Error(error.message);
      await supabase.from("audit_logs").insert({
        change_type: "eval_negative_example",
        entity: item_id,
        driving_signal: "review_discard",
        triggered_by: "review_queue",
      });
      return NextResponse.json({ ok: true });
    }
  } catch (error: any) {
    console.error("Review action error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
