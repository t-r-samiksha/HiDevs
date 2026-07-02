import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: meeting, error } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const { data: items } = await supabase
      .from("items")
      .select("id, text, type, owner, status, trust_score, review_state, deadline_raw, deadline_iso")
      .eq("meeting_id", id);

    const itemIds = (items || []).map((i) => i.id);
    let contradictions: any[] = [];
    if (itemIds.length > 0) {
      const [{ data: ca }, { data: cb }] = await Promise.all([
        supabase.from("contradictions").select("*").in("item_a_id", itemIds),
        supabase.from("contradictions").select("*").in("item_b_id", itemIds),
      ]);
      contradictions = [...(ca || []), ...(cb || [])];
    }

    return NextResponse.json({ meeting, items: items || [], contradictions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: items } = await supabase
      .from("items")
      .select("id")
      .eq("meeting_id", id);

    const itemIds = (items || []).map((i) => i.id);

    if (itemIds.length > 0) {
      await supabase.from("escalation_logs").delete().in("item_id", itemIds);
      await supabase.from("reminders").delete().in("item_id", itemIds);
      await supabase
        .from("contradictions")
        .delete()
        .or(`item_a_id.in.(${itemIds.join(",")}),item_b_id.in.(${itemIds.join(",")})`);
      await supabase.from("items").delete().eq("meeting_id", id);
    }

    const { error } = await supabase.from("meetings").delete().eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, deleted_items: itemIds.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
