import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/reports/weekly?project_id=&week=
// week param: ISO date of the week start (e.g. "2026-06-29"). Omit for most recent.
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");
    const week = req.nextUrl.searchParams.get("week");

    if (!projectId) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    let query = supabase
      .from("reports")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (week) {
      query = query.eq("week_start", week.slice(0, 10));
    }

    const { data, error } = await query.limit(1).single();

    if (error || !data) {
      return NextResponse.json({ report: null });
    }

    return NextResponse.json({ report: data });
  } catch (error: any) {
    console.error("Weekly report GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
