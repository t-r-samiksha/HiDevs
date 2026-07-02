import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/risk/radar?project_id=
// Returns at_risk + blocked items enriched with escalation tier.
// Sorted: blocked first, then at_risk, then by deadline ASC.
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");

    let query = supabase
      .from("items")
      .select(`id, text, type, owner, status, deadline_iso, trust_score, meetings(id, title)`)
      .in("status", ["at_risk", "blocked"]);

    if (projectId) query = query.eq("project_id", projectId);

    const { data: items, error } = await query;
    if (error) throw new Error(error.message);

    // Enrich with latest escalation log per item
    const itemIds = (items || []).map((i) => i.id);
    const escalationMap: Record<string, any> = {};
    if (itemIds.length > 0) {
      const { data: logs } = await supabase
        .from("escalation_logs")
        .select("item_id, tier, status, created_at")
        .in("item_id", itemIds)
        .order("created_at", { ascending: false });

      for (const log of logs || []) {
        if (!escalationMap[log.item_id]) escalationMap[log.item_id] = log;
      }
    }

    const enriched = (items || []).map((item) => ({
      ...item,
      escalation: escalationMap[item.id] || null,
    }));

    enriched.sort((a, b) => {
      if (a.status === "blocked" && b.status !== "blocked") return -1;
      if (a.status !== "blocked" && b.status === "blocked") return 1;
      const da = a.deadline_iso ? new Date(a.deadline_iso).getTime() : Infinity;
      const db = b.deadline_iso ? new Date(b.deadline_iso).getTime() : Infinity;
      return da - db;
    });

    return NextResponse.json({ items: enriched });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
