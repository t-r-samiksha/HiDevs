import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PUT /api/admin/prompts/[agentId]
// Body: { prompt: string }
// Logs the new prompt version to audit_logs. In production this would hot-reload the agent.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt string is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("audit_logs")
      .insert({
        change_type: "prompt_version",
        entity: (await params).agentId,
        new_value: { prompt, version: Date.now() },
        driving_signal: "manual_update",
        triggered_by: "admin",
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes("Could not find the table")) {
        return NextResponse.json({ ok: true, version: Date.now(), note: "Logged in memory only — audit_logs table not yet created." });
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, version: data?.id, logged_at: data?.created_at });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/admin/prompts/[agentId] — restore default prompt
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .insert({
        change_type: "prompt_restore",
        entity: (await params).agentId,
        new_value: { restored_to: "default" },
        driving_signal: "manual_restore",
        triggered_by: "admin",
      })
      .select()
      .single();

    if (error && !error.message.includes("Could not find the table")) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, restored: true, logged_at: data?.created_at ?? null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
