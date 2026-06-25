import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function daysBetween(dateA: string, dateB: string): number {
  return Math.round((new Date(dateB).getTime() - new Date(dateA).getTime()) / (1000 * 60 * 60 * 24));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // Allow simulating a future date for the demo
    const today = body.simulate_date || new Date().toISOString().split("T")[0];

    // Fetch all non-done action items with high trust
    const { data: items, error } = await supabase
      .from("items")
      .select("*")
      .eq("type", "action_item")
      .neq("status", "done")
      .gte("trust_score", 0.85);

    if (error) throw new Error(error.message);
    if (!items || items.length === 0) {
      return NextResponse.json({ evaluated: 0, transitions: [] });
    }

    // Build status lookup for dependency checks
    const { data: allItems } = await supabase.from("items").select("id, status");
    const statusMap = new Map((allItems || []).map((i: any) => [i.id, i.status]));

    const transitions: any[] = [];

    for (const item of items) {
      const reasons: string[] = [];
      let newStatus: string | null = null;

      // Rule 1: Dependency blocking
      const deps = item.depends_on || [];
      const openDeps = deps.filter((depId: string) => {
        const s = statusMap.get(depId);
        return s && s !== "done";
      });
      if (openDeps.length > 0) {
        newStatus = "blocked";
        reasons.push(`Blocked by ${openDeps.length} open dependency`);
      }

      // Rule 2: Deadline proximity
      if (item.deadline_iso) {
        const daysUntil = daysBetween(today, item.deadline_iso);

        if (daysUntil < 0) {
          if (newStatus !== "blocked") newStatus = "at_risk";
          reasons.push(`Overdue by ${Math.abs(daysUntil)} days`);
        } else if (daysUntil <= 3) {
          if (newStatus !== "blocked") newStatus = "at_risk";
          reasons.push(`Deadline in ${daysUntil} days`);
        }
      }

      // Only update if status actually changes
      if (newStatus && newStatus !== item.status) {
        await supabase.from("items").update({ status: newStatus }).eq("id", item.id);
        transitions.push({
          item_id: item.id,
          text: item.text,
          owner: item.owner,
          old_status: item.status,
          new_status: newStatus,
          reasons,
        });
      }
    }

    return NextResponse.json({
      evaluated: items.length,
      transitions,
      simulated_date: today,
    });
  } catch (error: any) {
    console.error("Risk scan error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
