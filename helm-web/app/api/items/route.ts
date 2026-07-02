import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/items?project_id=&status=&owner=&type=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const projectId = searchParams.get("project_id");
    const status = searchParams.get("status");
    const owner = searchParams.get("owner");
    const type = searchParams.get("type");

    let query = supabase
      .from("items")
      .select(
        `id, text, type, owner, status, trust_score, review_state,
         deadline_raw, deadline_iso, source_quote, depends_on,
         supersedes_hint, created_at, meeting_id,
         meetings(id, title, date)`
      )
      .order("created_at", { ascending: false });

    if (projectId) query = query.eq("project_id", projectId);
    if (status) query = query.eq("status", status);
    if (owner) query = query.eq("owner", owner);
    if (type) query = query.eq("type", type);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ items: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
