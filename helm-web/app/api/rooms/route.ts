import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const JITSI_DOMAIN = process.env.JITSI_DOMAIN || "meet.jit.si";

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!projectId) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("project_id", projectId)
      .order("scheduled_time", { ascending: true });

    if (error) {
      if (error.message.includes("Could not find the table")) {
        return NextResponse.json({ rooms: [] });
      }
      throw new Error(error.message);
    }

    const rooms = (data || []).map((r) => ({
      ...r,
      join_url: `https://${JITSI_DOMAIN}/${r.jitsi_room_name}`,
    }));

    return NextResponse.json({ rooms });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { project_id, scheduled_time, meeting_id, status, created_by, title, name } = await req.json();
    if (!project_id) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    const jitsiRoomName = `helm-${randomUUID()}`;
    // The user-entered display title (jitsi_room_name stays a technical id).
    const roomTitle = String(title || name || "").trim() || null;

    const baseRow = {
      project_id,
      jitsi_room_name: jitsiRoomName,
      scheduled_time: scheduled_time || null,
      meeting_id: meeting_id || null,
      status: status === "live" ? "live" : "scheduled",
    };

    let { data, error } = await supabase
      .from("rooms")
      .insert({ ...baseRow, created_by: created_by || null, title: roomTitle })
      .select()
      .single();

    // Tolerate DBs where the created_by / title columns haven't been added yet —
    // the room still gets created (title is still returned in the response).
    if (error && /(created_by|title)/.test(error.message)) {
      ({ data, error } = await supabase.from("rooms").insert(baseRow).select().single());
    }

    if (error) throw new Error(error.message);

    return NextResponse.json(
      { ...data, title: roomTitle, join_url: `https://${JITSI_DOMAIN}/${jitsiRoomName}` },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
