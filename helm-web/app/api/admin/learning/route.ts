import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/admin/learning?limit=
// Shows recent adaptive threshold changes from audit_logs, enriched with owner profiles.
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "20"), 100);

    const { data: changes, error } = await supabase
      .from("audit_logs")
      .select("id, entity, old_value, new_value, driving_signal, triggered_by, created_at")
      .eq("change_type", "threshold_change")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (error.message.includes("Could not find the table")) {
        return NextResponse.json({ changes: [] });
      }
      throw new Error(error.message);
    }

    const ownerIds = [...new Set((changes || []).map((c) => c.entity).filter(Boolean))];
    const { data: profiles } = ownerIds.length
      ? await supabase
          .from("owner_profiles")
          .select("user_id, false_atrisk_rate, avg_close_time_tier1")
          .in("user_id", ownerIds)
      : { data: [] };

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

    const enriched = (changes || []).map((c) => ({
      ...c,
      current_profile: profileMap.get(c.entity) || null,
    }));

    return NextResponse.json({ changes: enriched });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
