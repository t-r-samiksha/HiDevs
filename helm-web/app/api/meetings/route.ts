import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const projectId = searchParams.get("project_id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!projectId) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    const { data: meetings, error } = await supabase
      .from("meetings")
      .select("id, title, date, source_type, created_at")
      .eq("project_id", projectId)
      .order("date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(error.message);

    // Attach item counts per meeting
    const meetingIds = (meetings || []).map((m) => m.id);
    const countMap: Record<string, number> = {};
    if (meetingIds.length > 0) {
      const { data: itemRows } = await supabase
        .from("items")
        .select("meeting_id")
        .in("meeting_id", meetingIds);
      for (const row of itemRows || []) {
        countMap[row.meeting_id] = (countMap[row.meeting_id] || 0) + 1;
      }
    }

    const enriched = (meetings || []).map((m) => ({
      ...m,
      item_count: countMap[m.id] || 0,
    }));

    return NextResponse.json({ meetings: enriched, offset, limit });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, project_id, source_type = "manual", date } = await req.json();
    if (!title || !project_id) {
      return NextResponse.json(
        { error: "title and project_id are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("meetings")
      .insert({
        title,
        project_id,
        source_type,
        date: date || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ meeting: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
