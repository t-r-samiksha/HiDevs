import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/calendar?project_id=&from=&to=
// Returns unified array of rooms and item deadlines in the date range
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const projectId = searchParams.get("project_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!projectId || !from || !to) {
      return NextResponse.json(
        { error: "project_id, from, and to are required" },
        { status: 400 }
      );
    }

    const [{ data: rooms }, { data: deadlineItems }] = await Promise.all([
      supabase
        .from("rooms")
        .select("id, jitsi_room_name, scheduled_time, status, meeting_id")
        .eq("project_id", projectId)
        .gte("scheduled_time", from)
        .lte("scheduled_time", to)
        .order("scheduled_time", { ascending: true }),

      supabase
        .from("items")
        .select("id, text, type, owner, deadline_iso, deadline_raw, status")
        .eq("project_id", projectId)
        .not("deadline_iso", "is", null)
        .gte("deadline_iso", from)
        .lte("deadline_iso", to)
        .order("deadline_iso", { ascending: true }),
    ]);

    const events = [
      ...(rooms || []).map((r) => ({
        type: "room" as const,
        id: r.id,
        title: r.jitsi_room_name,
        time: r.scheduled_time,
        status: r.status,
        meeting_id: r.meeting_id,
      })),
      ...(deadlineItems || []).map((i) => ({
        type: "deadline" as const,
        id: i.id,
        title: i.text,
        time: i.deadline_iso,
        item_type: i.type,
        owner: i.owner,
        status: i.status,
        deadline_raw: i.deadline_raw,
      })),
    ].sort((a, b) => (a.time || "").localeCompare(b.time || ""));

    return NextResponse.json({ events });
  } catch (error: any) {
    console.error("Calendar error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
