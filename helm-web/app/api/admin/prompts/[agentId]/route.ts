import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AGENT_PROMPTS } from "../route";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PUT /api/admin/prompts/[agentId] — persist a prompt override to agent_prompts
// and record a version in audit_logs.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const agentId = (await params).agentId;
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt string is required" }, { status: 400 });
    }
    const name = AGENT_PROMPTS.find((a) => a.agentId === agentId)?.name ?? agentId;

    const { error } = await supabase
      .from("agent_prompts")
      .upsert({ agent_id: agentId, name, prompt, updated_at: new Date().toISOString() });
    if (error) {
      if (error.message.includes("Could not find the table")) {
        return NextResponse.json(
          { error: "agent_prompts table not created yet — run the setup-db SQL." },
          { status: 422 }
        );
      }
      throw new Error(error.message);
    }

    // Version history (best-effort — never blocks the save).
    await supabase
      .from("audit_logs")
      .insert({
        change_type: "prompt_version",
        entity: agentId,
        new_value: { prompt, version: Date.now() },
        driving_signal: "manual_update",
        triggered_by: "admin",
      })
      .then(undefined, () => {});

    return NextResponse.json({ ok: true, agent_id: agentId, saved: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/admin/prompts/[agentId] — restore default (delete the override).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const agentId = (await params).agentId;
    const { error } = await supabase.from("agent_prompts").delete().eq("agent_id", agentId);
    if (error && !error.message.includes("Could not find the table")) {
      throw new Error(error.message);
    }

    await supabase
      .from("audit_logs")
      .insert({
        change_type: "prompt_restore",
        entity: agentId,
        new_value: { restored_to: "default" },
        driving_signal: "manual_restore",
        triggered_by: "admin",
      })
      .then(undefined, () => {});

    const def = AGENT_PROMPTS.find((a) => a.agentId === agentId)?.prompt ?? "";
    return NextResponse.json({ ok: true, restored: true, prompt: def });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
