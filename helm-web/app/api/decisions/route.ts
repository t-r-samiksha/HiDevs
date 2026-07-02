import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/decisions?project_id= — all decisions with supersedes chain + contradictions
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!projectId) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    const { data: decisions, error } = await supabase
      .from("items")
      .select(
        `id, text, owner, trust_score, review_state, supersedes_hint,
         created_at, source_quote,
         meetings(id, title, date)`
      )
      .eq("project_id", projectId)
      .eq("type", "decision")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    if (!decisions || decisions.length === 0) {
      return NextResponse.json({ decisions: [] });
    }

    // Fetch all contradictions for decisions in this project
    const decisionIds = decisions.map((d) => d.id);
    const [{ data: contraA }, { data: contraB }] = await Promise.all([
      supabase
        .from("contradictions")
        .select("item_a_id, item_b_id, description")
        .in("item_a_id", decisionIds),
      supabase
        .from("contradictions")
        .select("item_a_id, item_b_id, description")
        .in("item_b_id", decisionIds),
    ]);

    // Index contradictions by decision id
    const contraMap = new Map<string, any[]>();
    for (const c of [...(contraA || []), ...(contraB || [])]) {
      const ids = [c.item_a_id, c.item_b_id];
      for (const id of ids) {
        if (!contraMap.has(id)) contraMap.set(id, []);
        contraMap.get(id)!.push(c);
      }
    }

    const enriched = decisions.map((d) => ({
      ...d,
      contradictions: contraMap.get(d.id) || [],
      has_supersedes: Boolean(d.supersedes_hint),
    }));

    return NextResponse.json({ decisions: enriched });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
