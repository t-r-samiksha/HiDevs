import { NextRequest, NextResponse } from "next/server";
import { mastra } from "@/lib/mastra-instance";

// POST /api/workflows/weekly-report — executes the real Mastra weeklyReportWorkflow
// (aggregate 7 days → persist report → Slack). Body: { project_id }.
export async function POST(req: NextRequest) {
  try {
    const { project_id } = await req.json().catch(() => ({}));
    if (!project_id) return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    const run = await mastra.getWorkflow("weeklyReportWorkflow").createRun();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await run.start({ inputData: { project_id } })) as any;
    if (result.status === "success") return NextResponse.json(result.result);
    return NextResponse.json({ error: "workflow did not complete", status: result.status }, { status: 500 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}
