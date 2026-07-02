import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/dashboard/briefing?project_id=
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!projectId) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const [
      { data: overdueItems },
      { data: atRiskItems },
      { data: pendingFollowups },
      { data: pendingReviews },
    ] = await Promise.all([
      // Items due today or overdue (deadline_iso <= today, not done)
      supabase
        .from("items")
        .select("id, text, type, owner, deadline_iso, deadline_raw, status")
        .eq("project_id", projectId)
        .neq("status", "done")
        .not("deadline_iso", "is", null)
        .lte("deadline_iso", today + "T23:59:59Z"),

      // Items currently at risk or blocked
      supabase
        .from("items")
        .select("id, text, type, owner, status, deadline_raw")
        .eq("project_id", projectId)
        .in("status", ["at_risk", "blocked"]),

      // Pending escalation logs (follow-ups awaiting action)
      supabase
        .from("escalation_logs")
        .select("id, item_id, tier, drafted_text, created_at")
        .eq("status", "pending"),

      // Items needing review (review_state = pending_review)
      supabase
        .from("items")
        .select("id, text, type, trust_score")
        .eq("project_id", projectId)
        .eq("review_state", "pending_review"),
    ]);

    // Separate overdue from due-today
    const nowIso = new Date().toISOString();
    const dueToday = (overdueItems || []).filter((i) => i.deadline_iso >= today);
    const overdue = (overdueItems || []).filter((i) => i.deadline_iso < today);

    return NextResponse.json({
      date: today,
      due_today: dueToday,
      overdue,
      at_risk: atRiskItems || [],
      pending_followups_count: (pendingFollowups || []).length,
      pending_reviews_count: (pendingReviews || []).length,
      pending_reviews: pendingReviews || [],
      summary: {
        due_today_count: dueToday.length,
        overdue_count: overdue.length,
        at_risk_count: (atRiskItems || []).length,
        pending_followups: (pendingFollowups || []).length,
        pending_reviews: (pendingReviews || []).length,
      },
    });
  } catch (error: any) {
    console.error("Dashboard briefing error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
