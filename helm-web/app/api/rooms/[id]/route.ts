import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const JITSI_DOMAIN = process.env.JITSI_DOMAIN || "meet.jit.si";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { data, error } = await supabase
      .from("rooms")
      .select("*, meetings(id, title, date)")
      .eq("id", (await params).id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...data,
      join_url: `https://${JITSI_DOMAIN}/${data.jitsi_room_name}`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { status, meeting_id } = await req.json();
    const validStatuses = ["scheduled", "live", "ended"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: "status must be scheduled | live | ended" }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (status) updates.status = status;
    if (meeting_id) updates.meeting_id = meeting_id;

    const { data, error } = await supabase
      .from("rooms")
      .update(updates)
      .eq("id", (await params).id)
      .select("*, meetings(id, title, date)")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ room: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
