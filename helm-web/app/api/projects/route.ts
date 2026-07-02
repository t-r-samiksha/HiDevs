import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/projects — list all projects with aggregate counts
export async function GET() {
  try {
    const { data: projects, error } = await supabase
      .from("projects")
      .select("id, name, created_at")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    if (!projects || projects.length === 0) {
      return NextResponse.json({ projects: [] });
    }

    const projectIds = projects.map((p) => p.id);

    const [meetingsRes, itemsRes, activeItemsRes] = await Promise.all([
      supabase.from("meetings").select("project_id").in("project_id", projectIds),
      supabase.from("items").select("project_id").in("project_id", projectIds),
      supabase
        .from("items")
        .select("project_id, owner")
        .in("project_id", projectIds)
        .neq("status", "done"),
    ]);

    const meetingCounts: Record<string, number> = {};
    const itemCounts: Record<string, number> = {};
    const memberSets: Record<string, Set<string>> = {};

    for (const m of meetingsRes.data || []) {
      meetingCounts[m.project_id] = (meetingCounts[m.project_id] || 0) + 1;
    }
    for (const i of itemsRes.data || []) {
      itemCounts[i.project_id] = (itemCounts[i.project_id] || 0) + 1;
    }
    for (const i of activeItemsRes.data || []) {
      if (!memberSets[i.project_id]) memberSets[i.project_id] = new Set();
      if (i.owner) memberSets[i.project_id].add(i.owner);
    }

    const enriched = projects.map((p) => ({
      ...p,
      total_meetings: meetingCounts[p.id] || 0,
      total_items: itemCounts[p.id] || 0,
      active_members: memberSets[p.id]?.size || 0,
    }));

    return NextResponse.json({ projects: enriched });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/projects
// Body: { name, owners?: string[] }
export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({ name })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ project: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
