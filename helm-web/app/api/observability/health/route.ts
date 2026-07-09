import { NextResponse } from "next/server";
import { getTraces } from "@/lib/observability";
import { securityHeaders } from "@/lib/security";

// GET /api/observability/health — process uptime, memory, and last LLM activity.
export async function GET() {
  const mem = process.memoryUsage();
  const traces = getTraces(1);
  return NextResponse.json(
    {
      status: "healthy",
      uptime_seconds: Math.round(process.uptime()),
      memory: {
        rss_mb: Math.round(mem.rss / 1024 / 1024),
        heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
      },
      node_version: process.version,
      last_llm_activity: traces[0]?.timestamp ?? null,
      timestamp: new Date().toISOString(),
    },
    { headers: securityHeaders() }
  );
}
