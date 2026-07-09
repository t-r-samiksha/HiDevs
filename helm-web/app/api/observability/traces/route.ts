import { NextRequest, NextResponse } from "next/server";
import { getTraces, getTraceStats } from "@/lib/observability";
import { securityHeaders } from "@/lib/security";

// GET /api/observability/traces?limit=100 — recent LLM traces + aggregate stats.
export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "100"), 1000);
  return NextResponse.json(
    { traces: getTraces(limit), stats: getTraceStats() },
    { headers: securityHeaders() }
  );
}
