import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PUT /api/integrations/[id]/mapping
// Body: { type_map?, priority_map?, field_map? }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { type_map, priority_map, field_map } = await req.json();
    const updates: Record<string, any> = {};
    if (type_map !== undefined) updates.type_map = type_map;
    if (priority_map !== undefined) updates.priority_map = priority_map;
    if (field_map !== undefined) updates.field_map = field_map;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Provide at least one of: type_map, priority_map, field_map" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("integration_configs")
      .update(updates)
      .eq("id", (await params).id)
      .select("id, type_map, priority_map, field_map")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ integration: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
