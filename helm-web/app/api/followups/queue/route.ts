import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/followups/queue?project_id=
// Returns pending escalation_logs with item context. Tier 3 first.
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");

    const { data, error } = await supabase
      .from("escalation_logs")
      .select(
        `id, item_id, tier, drafted_text, status, created_at,
         items(id, text, owner, deadline_raw, type, project_id)`
      )
      .eq("status", "pending")
      .order("tier", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const filtered = projectId
      ? (data || []).filter((log: any) => log.items?.project_id === projectId)
      : data || [];

    return NextResponse.json({ followups: filtered, count: filtered.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
