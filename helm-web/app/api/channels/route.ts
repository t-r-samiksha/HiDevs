import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/channels?project_id= — list all channels for a project
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!projectId) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("channels")
      .select("id, name, is_dm, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) {
      if (error.message.includes("Could not find the table")) {
        return NextResponse.json({ channels: [] });
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ channels: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/channels — create a channel
// Body: { project_id, name, is_dm?: false, member_ids?: string[] }
export async function POST(req: NextRequest) {
  try {
    const { project_id, name, is_dm = false, member_ids = [] } = await req.json();

    if (!project_id || !name) {
      return NextResponse.json(
        { error: "project_id and name are required" },
        { status: 400 }
      );
    }

    const { data: channel, error } = await supabase
      .from("channels")
      .insert({ project_id, name, is_dm })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Add initial members if provided
    if (member_ids.length > 0) {
      await supabase.from("channel_members").insert(
        member_ids.map((user_id: string) => ({ channel_id: channel.id, user_id }))
      );
    }

    return NextResponse.json({ channel }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
