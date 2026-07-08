import { NextRequest, NextResponse } from "next/server";
import { mastra } from "@/lib/mastra-instance";

// POST/GET /api/workflows/insights — executes the real Mastra
// strategicInsightWorkflow (5 insight engines as steps). Body/query: project_id.
async function run(project_id: string | null) {
  if (!project_id) return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  const wf = await mastra.getWorkflow("strategicInsightWorkflow").createRun();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await wf.start({ inputData: { project_id } })) as any;
  if (result.status === "success") return NextResponse.json({ signals: result.result.signals ?? [] });
  return NextResponse.json({ signals: [], status: result.status });
}

export async function POST(req: NextRequest) {
  try {
    const { project_id } = await req.json().catch(() => ({}));
    return await run(project_id ?? null);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    return await run(req.nextUrl.searchParams.get("project_id"));
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}
