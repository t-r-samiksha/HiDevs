import { NextRequest, NextResponse } from "next/server";
import { mastra } from "@/lib/mastra";

// POST /api/pipeline/supervise — runs the registered pipelineSupervisorWorkflow
// (extract → validate → Enkrypt trust → Enkrypt PII → eval score) over a
// transcript. Body: { transcript: string, title?: string }. Read-only: returns
// the orchestration result without writing to Qdrant/Supabase.
export async function POST(req: NextRequest) {
  try {
    const { transcript, title } = await req.json();
    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json({ error: "transcript (string) is required" }, { status: 400 });
    }

    const run = await mastra.getWorkflow("pipelineSupervisorWorkflow").createRun();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await run.start({ inputData: { transcript, title: title || "Untitled Meeting" } })) as any;

    if (result.status === "success") {
      return NextResponse.json(result.result);
    }
    return NextResponse.json(
      { error: "Pipeline supervisor workflow did not complete", status: result.status },
      { status: 500 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Pipeline supervise error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
