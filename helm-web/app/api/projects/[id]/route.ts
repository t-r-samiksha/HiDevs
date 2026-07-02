import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/projects/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: project, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const [meetingsRes, itemsRes] = await Promise.all([
      supabase
        .from("meetings")
        .select("id, title, date, source_type")
        .eq("project_id", id)
        .order("date", { ascending: false })
        .limit(5),
      supabase.from("items").select("status, owner").eq("project_id", id),
    ]);

    const statusBreakdown: Record<string, number> = {};
    const ownerSet = new Set<string>();
    for (const item of itemsRes.data || []) {
      statusBreakdown[item.status] = (statusBreakdown[item.status] || 0) + 1;
      if (item.owner) ownerSet.add(item.owner);
    }

    return NextResponse.json({
      project,
      recent_meetings: meetingsRes.data || [],
      item_status_breakdown: statusBreakdown,
      active_members: ownerSet.size,
      members: Array.from(ownerSet),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/projects/[id]
// Body: { name }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { name } = await req.json();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("projects")
      .update({ name })
      .eq("id", (await params).id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ project: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
