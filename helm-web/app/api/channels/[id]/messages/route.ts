import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/channels/[id]/messages?limit=50&cursor=<created_at>
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50"), 100);
    const cursor = req.nextUrl.searchParams.get("cursor"); // created_at of last message

    let query = supabase
      .from("messages")
      .select(
        `id, text, created_at,
         sender:users!messages_sender_id_fkey(id, name, email)`
      )
      .eq("channel_id", (await params).id)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Cursor-based pagination: fetch messages older than cursor
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const messages = (data || []).reverse(); // return chronological order
    const nextCursor = messages.length > 0 ? messages[0].created_at : null;

    return NextResponse.json({ messages, next_cursor: nextCursor });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/channels/[id]/messages — send a message
// Body: { sender_id, text }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { sender_id, text } = await req.json();

    if (!sender_id || !text?.trim()) {
      return NextResponse.json(
        { error: "sender_id and text are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({ channel_id: (await params).id, sender_id, text: text.trim() })
      .select(
        `id, text, created_at,
         sender:users!messages_sender_id_fkey(id, name, email)`
      )
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ message: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
