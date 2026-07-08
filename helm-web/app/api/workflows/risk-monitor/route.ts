import { NextRequest, NextResponse } from "next/server";
import { mastra } from "@/lib/mastra-instance";

// POST /api/workflows/risk-monitor — executes the real Mastra riskMonitorWorkflow.
// Body: { simulate_date?: string }. (Additive route; does not touch /api/risk-scan.)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const run = await mastra.getWorkflow("riskMonitorWorkflow").createRun();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await run.start({ inputData: { simulate_date: body.simulate_date } })) as any;
    if (result.status === "success") return NextResponse.json(result.result);
    return NextResponse.json({ error: "workflow did not complete", status: result.status }, { status: 500 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}
