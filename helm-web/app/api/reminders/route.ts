import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/reminders?project_id= — list upcoming reminders for a project
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");

    let query = supabase
      .from("reminders")
      .select(
        `id, item_id, user_id, remind_at, message, sent,
         items!inner(id, text, type, owner, deadline_raw, project_id)`
      )
      .order("remind_at", { ascending: true });

    if (projectId) {
      query = query.eq("items.project_id", projectId);
    }

    const { data, error } = await query;
    if (error) {
      if (error.message.includes("Could not find the table")) {
        return NextResponse.json({ reminders: [] });
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ reminders: data || [] });
  } catch (error: any) {
    console.error("Reminders GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/reminders — create a manual reminder
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { item_id, remind_at, message } = body;

    if (!item_id || !remind_at || !message) {
      return NextResponse.json(
        { error: "item_id, remind_at, and message are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("reminders")
      .insert({ item_id, remind_at, message, sent: false })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ reminder: data }, { status: 201 });
  } catch (error: any) {
    console.error("Reminders POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
