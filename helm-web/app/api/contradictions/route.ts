import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/contradictions?project_id= — all contradictions for a project
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!projectId) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    // Get all item IDs for this project to filter contradictions
    const { data: projectItems, error: itemsErr } = await supabase
      .from("items")
      .select("id")
      .eq("project_id", projectId);

    if (itemsErr) throw new Error(itemsErr.message);

    const ids = (projectItems || []).map((i) => i.id);
    if (ids.length === 0) {
      return NextResponse.json({ contradictions: [] });
    }

    // Fetch contradictions where either item belongs to this project
    const { data, error } = await supabase
      .from("contradictions")
      .select("id, item_a_id, item_b_id, description")
      .or(`item_a_id.in.(${ids.join(",")}),item_b_id.in.(${ids.join(",")})`)
      .order("id", { ascending: false });

    if (error) throw new Error(error.message);

    // Enrich with item text for both sides
    const allItemIds = new Set<string>();
    for (const c of data || []) {
      allItemIds.add(c.item_a_id);
      allItemIds.add(c.item_b_id);
    }

    const { data: itemDetails } = await supabase
      .from("items")
      .select("id, text, type, owner, trust_score")
      .in("id", Array.from(allItemIds));

    const itemMap = new Map((itemDetails || []).map((i) => [i.id, i]));

    const enriched = (data || []).map((c) => ({
      ...c,
      item_a: itemMap.get(c.item_a_id) || null,
      item_b: itemMap.get(c.item_b_id) || null,
    }));

    return NextResponse.json({ contradictions: enriched });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
