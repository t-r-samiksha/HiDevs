import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/admin/thresholds
// Lists all adaptive_thresholds with owner name and locked status.
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("adaptive_thresholds")
      .select(
        `id, owner_id, item_type, at_risk_days, silence_days, locked, updated_at,
         users!owner_id(name, email)`
      )
      .order("updated_at", { ascending: false });

    if (error) {
      if (error.message.includes("Could not find the table")) {
        return NextResponse.json({ thresholds: [] });
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ thresholds: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
