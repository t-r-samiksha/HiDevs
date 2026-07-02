import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// BFS to collect all downstream report IDs (direct or recursive)
async function collectReportIds(
  managerId: string,
  scope: "direct" | "all"
): Promise<string[]> {
  const { data: direct } = await supabase
    .from("users")
    .select("id")
    .eq("manager_id", managerId);

  const directIds = (direct || []).map((u) => u.id);
  if (scope === "direct" || directIds.length === 0) return directIds;

  // BFS for all downstream
  const visited = new Set(directIds);
  const queue = [...directIds];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const { data: reports } = await supabase
      .from("users")
      .select("id")
      .eq("manager_id", current);

    for (const u of reports || []) {
      if (!visited.has(u.id)) {
        visited.add(u.id);
        queue.push(u.id);
      }
    }
  }

  return Array.from(visited);
}

// GET /api/team/status?scope=direct|all&user_id=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const userId = searchParams.get("user_id");
    const scope = (searchParams.get("scope") || "direct") as "direct" | "all";

    if (!userId) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }
    if (!["direct", "all"].includes(scope)) {
      return NextResponse.json({ error: "scope must be 'direct' or 'all'" }, { status: 400 });
    }

    const reportIds = await collectReportIds(userId, scope);

    if (reportIds.length === 0) {
      return NextResponse.json({ team: [] });
    }

    // Fetch user details
    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select("id, name, email, role")
      .in("id", reportIds);

    if (usersErr) throw new Error(usersErr.message);

    // Fetch items for all these users and count by status
    const { data: items } = await supabase
      .from("items")
      .select("owner, status")
      .in("owner", reportIds);

    // Build status count per user
    const statusCounts = new Map<
      string,
      { open: number; in_progress: number; at_risk: number; blocked: number; done: number }
    >();

    for (const userId of reportIds) {
      statusCounts.set(userId, {
        open: 0,
        in_progress: 0,
        at_risk: 0,
        blocked: 0,
        done: 0,
      });
    }

    for (const item of items || []) {
      if (!item.owner) continue;
      const counts = statusCounts.get(item.owner);
      if (!counts) continue;
      const status = item.status as keyof typeof counts;
      if (status in counts) (counts[status] as number)++;
    }

    const team = (users || []).map((u) => ({
      user_id: u.id,
      name: u.name,
      role: u.role,
      ...statusCounts.get(u.id),
    }));

    return NextResponse.json({ team, scope, manager_id: userId });
  } catch (error: any) {
    console.error("Team status error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
