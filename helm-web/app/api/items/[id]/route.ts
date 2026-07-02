import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/items/[id] — full item detail with meeting, contradictions, and dependency items
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: item, error } = await supabase
      .from("items")
      .select(
        `*, meetings(id, title, date, transcript_text)`
      )
      .eq("id", id)
      .single();

    if (error || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Contradictions involving this item (either as item_a or item_b)
    const [{ data: contraA }, { data: contraB }] = await Promise.all([
      supabase.from("contradictions").select("*").eq("item_a_id", id),
      supabase.from("contradictions").select("*").eq("item_b_id", id),
    ]);
    const contradictions = [...(contraA || []), ...(contraB || [])];

    // Resolve depends_on item IDs to full items
    const dependsOnIds: string[] = item.depends_on || [];
    let dependsOnItems: any[] = [];
    if (dependsOnIds.length > 0) {
      const { data: deps } = await supabase
        .from("items")
        .select("id, text, type, owner, status, deadline_raw")
        .in("id", dependsOnIds);
      dependsOnItems = deps || [];
    }

    return NextResponse.json({
      item,
      contradictions,
      depends_on_items: dependsOnItems,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/items/[id] — update item fields
// Body can include: text, owner, deadline_raw, deadline_iso, status, depends_on
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await req.json();
    const allowed = ["text", "owner", "deadline_raw", "deadline_iso", "status", "depends_on"];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("items")
      .update(updates)
      .eq("id", (await params).id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ item: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
