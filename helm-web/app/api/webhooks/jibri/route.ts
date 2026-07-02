import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/webhooks/jibri
// Jibri calls this when a recording is complete.
// Body: { room_id, recording_url }
export async function POST(req: NextRequest) {
  try {
    const { room_id, recording_url } = await req.json();
    if (!room_id || !recording_url) {
      return NextResponse.json(
        { error: "room_id and recording_url are required" },
        { status: 400 }
      );
    }

    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("id, project_id, jitsi_room_name")
      .eq("id", room_id)
      .single();

    if (roomErr || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Create a meeting record linked to this room
    const { data: meeting, error: meetErr } = await supabase
      .from("meetings")
      .insert({
        project_id: room.project_id,
        title: `Live Recording — ${room.jitsi_room_name}`,
        source_type: "jibri",
        date: new Date().toISOString(),
      })
      .select()
      .single();

    if (meetErr) throw new Error(meetErr.message);

    // Mark room ended and link to meeting
    await supabase
      .from("rooms")
      .update({ status: "ended", meeting_id: meeting.id })
      .eq("id", room_id);

    // Log recording URL — item extraction requires a subsequent POST /api/meetings/{id}/recording
    await supabase
      .from("audit_logs")
      .insert({
        change_type: "jibri_recording",
        entity: meeting.id,
        new_value: { recording_url, room_id },
        triggered_by: "jibri_webhook",
      });

    return NextResponse.json({
      ok: true,
      meeting_id: meeting.id,
      recording_url,
      note: "Meeting created. To extract items, POST the recording file to /api/meetings/{id}/recording",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
