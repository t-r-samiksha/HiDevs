import { NextRequest, NextResponse } from "next/server";
import { mastra } from "@/lib/mastra";

// Executes the real Mastra strategicInsightWorkflow (5 engines = 5 steps)
// instead of running the engines inline.
export async function GET(req: NextRequest) {
  try {
    const project_id = req.nextUrl.searchParams.get("project_id");
    if (!project_id) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    const run = await mastra.getWorkflow("strategicInsightWorkflow").createRun();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await run.start({ inputData: { project_id } })) as any;

    if (result.status === "success") {
      return NextResponse.json({ signals: result.result.signals ?? [] });
    }
    return NextResponse.json({ signals: [], status: result.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Insights error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
