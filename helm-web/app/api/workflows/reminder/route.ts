import { NextRequest, NextResponse } from "next/server";
import { mastra } from "@/lib/mastra-instance";

// POST /api/workflows/reminder — executes the real Mastra reminderWorkflow
// (query due items → 24h dedup → create reminders → Slack). Body: { project_id? }.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const run = await mastra.getWorkflow("reminderWorkflow").createRun();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await run.start({ inputData: { project_id: body.project_id } })) as any;
    if (result.status === "success") return NextResponse.json(result.result);
    return NextResponse.json({ error: "workflow did not complete", status: result.status }, { status: 500 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}
