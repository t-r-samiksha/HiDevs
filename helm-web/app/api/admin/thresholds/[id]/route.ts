import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PUT /api/admin/thresholds/[id]
// Body: { at_risk_days?, silence_days?, locked? }
// Logs the change to audit_logs.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { at_risk_days, silence_days, locked } = await req.json();

    const { data: current, error: fetchErr } = await supabase
      .from("adaptive_thresholds")
      .select("*")
      .eq("id", (await params).id)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json({ error: "Threshold not found" }, { status: 404 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (at_risk_days !== undefined) updates.at_risk_days = at_risk_days;
    if (silence_days !== undefined) updates.silence_days = silence_days;
    if (locked !== undefined) updates.locked = locked;

    const { data, error } = await supabase
      .from("adaptive_thresholds")
      .update(updates)
      .eq("id", (await params).id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    await supabase
      .from("audit_logs")
      .insert({
        change_type: "threshold_change",
        entity: current.owner_id || (await params).id,
        old_value: {
          at_risk_days: current.at_risk_days,
          silence_days: current.silence_days,
          locked: current.locked,
        },
        new_value: {
          at_risk_days: data.at_risk_days,
          silence_days: data.silence_days,
          locked: data.locked,
        },
        driving_signal: "manual_override",
        triggered_by: "admin",
      });

    return NextResponse.json({ threshold: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
