import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/review/queue?project_id=
// Returns all items in pending_review or quarantined, worst trust first.
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");

    let query = supabase
      .from("items")
      .select(
        `id, text, type, owner, trust_score, review_state, source_quote,
         created_at, meetings(id, title, date)`
      )
      .in("review_state", ["pending_review", "quarantined"])
      .order("trust_score", { ascending: true });

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const items = data || [];
    return NextResponse.json({
      items,
      counts: {
        pending_review: items.filter((i) => i.review_state === "pending_review").length,
        quarantined: items.filter((i) => i.review_state === "quarantined").length,
        total: items.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
