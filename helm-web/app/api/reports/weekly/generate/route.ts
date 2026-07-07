import { NextRequest, NextResponse } from "next/server";
import { mastra } from "@/lib/mastra";

// Executes the real Mastra weeklyReportWorkflow (aggregate → persist → Slack).
export async function POST(req: NextRequest) {
  try {
    const { project_id } = await req.json();
    if (!project_id) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    const run = await mastra.getWorkflow("weeklyReportWorkflow").createRun();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await run.start({ inputData: { project_id } })) as any;

    if (result.status === "success") {
      return NextResponse.json({ success: true, report: result.result.report });
    }
    return NextResponse.json(
      { error: "Weekly report workflow did not complete", status: result.status },
      { status: 500 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Weekly report generate error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
