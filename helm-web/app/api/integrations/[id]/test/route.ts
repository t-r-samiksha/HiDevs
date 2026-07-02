import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/integrations/[id]/test
// Simulates pushing a sample item through the integration mapping.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { data: config, error } = await supabase
      .from("integration_configs")
      .select("id, tool, type_map, priority_map, field_map")
      .eq("id", (await params).id)
      .single();

    if (error || !config) {
      return NextResponse.json({ error: "Integration config not found" }, { status: 404 });
    }

    const sampleItem = {
      type: "action",
      text: "Deploy backend API to staging by Friday",
      owner: "dev@example.com",
      deadline_iso: "2026-07-11",
      priority: "high",
    };

    const typeMap = (config.type_map as Record<string, string>) || {};
    const priorityMap = (config.priority_map as Record<string, string>) || {};
    const fieldMap = (config.field_map as Record<string, string>) || {};

    const sample_output: Record<string, any> = {
      [fieldMap["type"] || "issuetype"]: typeMap[sampleItem.type] || sampleItem.type,
      [fieldMap["text"] || "summary"]: sampleItem.text,
      [fieldMap["owner"] || "assignee"]: sampleItem.owner,
      [fieldMap["deadline"] || "duedate"]: sampleItem.deadline_iso,
      [fieldMap["priority"] || "priority"]: priorityMap[sampleItem.priority] || sampleItem.priority,
    };

    // Mark config as recently tested
    await supabase
      .from("integration_configs")
      .update({ health_status: "ok", last_sync_at: new Date().toISOString() })
      .eq("id", (await params).id);

    return NextResponse.json({ success: true, tool: config.tool, sample_output });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
