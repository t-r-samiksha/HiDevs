import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/admin/audit-log?page=1&limit=25&change_type=&entity=&triggered_by=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(parseInt(searchParams.get("limit") || "25"), 100);
    const changeType = searchParams.get("change_type");
    const entity = searchParams.get("entity");
    const triggeredBy = searchParams.get("triggered_by");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("audit_logs")
      .select(
        "id, change_type, entity, old_value, new_value, driving_signal, triggered_by, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (changeType) query = query.eq("change_type", changeType);
    if (entity) query = query.eq("entity", entity);
    if (triggeredBy) query = query.eq("triggered_by", triggeredBy);

    const { data, error, count } = await query;

    if (error) {
      if (error.message.includes("Could not find the table")) {
        return NextResponse.json({ logs: [], total: 0, page, limit, pages: 0 });
      }
      throw new Error(error.message);
    }

    return NextResponse.json({
      logs: data || [],
      total: count ?? 0,
      page,
      limit,
      pages: Math.ceil((count ?? 0) / limit),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
