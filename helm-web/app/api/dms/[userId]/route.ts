import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/dms/[userId] — find or create a DM channel between two users
// Body: { from_user_id, project_id }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { from_user_id, project_id } = await req.json();
    const to_user_id = (await params).userId;

    if (!from_user_id) {
      return NextResponse.json({ error: "from_user_id is required" }, { status: 400 });
    }
    if (from_user_id === to_user_id) {
      return NextResponse.json({ error: "Cannot DM yourself" }, { status: 400 });
    }

    // Find a DM channel that both users are members of
    // Strategy: get all DM channel_ids for from_user, intersect with to_user's
    const [{ data: fromChannels }, { data: toChannels }] = await Promise.all([
      supabase
        .from("channel_members")
        .select("channel_id, channels!inner(is_dm)")
        .eq("user_id", from_user_id)
        .eq("channels.is_dm", true),
      supabase
        .from("channel_members")
        .select("channel_id")
        .eq("user_id", to_user_id),
    ]);

    const fromIds = new Set((fromChannels || []).map((r: any) => r.channel_id));
    const existing = (toChannels || []).find((r: any) => fromIds.has(r.channel_id));

    if (existing) {
      const { data: channel } = await supabase
        .from("channels")
        .select("*")
        .eq("id", existing.channel_id)
        .single();
      return NextResponse.json({ channel, created: false });
    }

    // Create a new DM channel
    const { data: channel, error } = await supabase
      .from("channels")
      .insert({ project_id: project_id || null, name: "DM", is_dm: true })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Add both users as members
    const { error: memberErr } = await supabase.from("channel_members").insert([
      { channel_id: channel.id, user_id: from_user_id },
      { channel_id: channel.id, user_id: to_user_id },
    ]);

    if (memberErr) throw new Error(memberErr.message);

    return NextResponse.json({ channel, created: true }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
