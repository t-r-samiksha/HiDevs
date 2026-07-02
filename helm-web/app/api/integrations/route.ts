import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/integrations?workspace_id=
export async function GET(req: NextRequest) {
  try {
    const workspaceId = req.nextUrl.searchParams.get("workspace_id");
    if (!workspaceId) {
      return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("integration_configs")
      .select(
        "id, workspace_id, tool, project_key, health_status, last_sync_at, created_at, type_map, priority_map, field_map"
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.message.includes("Could not find the table")) {
        return NextResponse.json({ integrations: [] });
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ integrations: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/integrations
// Body: { workspace_id, tool, project_key, type_map, priority_map, field_map, credentials_encrypted }
export async function POST(req: NextRequest) {
  try {
    const {
      workspace_id,
      tool,
      project_key,
      type_map = {},
      priority_map = {},
      field_map = {},
      credentials_encrypted = {},
    } = await req.json();

    if (!workspace_id || !tool) {
      return NextResponse.json(
        { error: "workspace_id and tool are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("integration_configs")
      .insert({
        workspace_id,
        tool,
        project_key: project_key || null,
        type_map,
        priority_map,
        field_map,
        credentials_encrypted,
        health_status: "ok",
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes("Could not find the table")) {
        return NextResponse.json(
          { error: "integration_configs table not yet created. Run the setup-db SQL first." },
          { status: 503 }
        );
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ integration: data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
