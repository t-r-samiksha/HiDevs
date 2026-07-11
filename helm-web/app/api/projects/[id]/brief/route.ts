import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "@ai-sdk/google";
import { generationModel } from "@/lib/model";
import { embed, generateText } from "ai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");
const COLLECTION = process.env.QDRANT_COLLECTION || "meeting_items";
const CHUNKS_COLLECTION = "transcript_chunks";

const BRIEF_SYSTEM_PROMPT =
  "You are Helm's briefing assistant. Synthesize a comprehensive project brief from the " +
  "meeting history provided. Include: 1) Project Goal, 2) Current Progress, 3) Completed Work, " +
  "4) Pending Work, 5) Team Responsibilities, 6) Key Decisions Made. Cite meetings with " +
  "[Meeting Title]. Format with clear headings. This brief is for a new team member joining the project.";

async function qdrantRawSearch(
  collection: string,
  vector: number[],
  topK: number,
  filter?: object
): Promise<Array<{ score: number; payload: Record<string, any> }>> {
  const url = `${process.env.QDRANT_URL}/collections/${collection}/points/search`;
  const body: Record<string, any> = { vector, limit: topK, with_payload: true };
  if (filter) body.filter = filter;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.QDRANT_API_KEY!,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 404) return [];
    return [];
  }
  const data = await res.json();
  return (data.result || []).map((r: any) => ({
    score: r.score ?? 0,
    payload: r.payload ?? {},
  }));
}

// GET /api/projects/[id]/brief — return the most recent cached brief
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { data } = await supabase
      .from("project_briefs")
      .select("id, brief_text, generated_at, sources_count")
      .eq("project_id", (await params).id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .single();

    if (!data) return NextResponse.json({ brief: null });

    return NextResponse.json({
      brief: data.brief_text,
      generated_at: data.generated_at,
      sources_count: data.sources_count,
    });
  } catch {
    return NextResponse.json({ brief: null });
  }
}

// POST /api/projects/[id]/brief — generate a fresh brief and cache it
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const projectId = (await params).id;

    // Embed a broad query to pull representative project content
    const { embedding } = await embed({
      model: embeddingModel,
      value:
        "project overview summary decisions action items goals progress team responsibilities",
    });

    const itemFilter = {
      must: [{ key: "project_id", match: { value: projectId } }],
      must_not: [{ key: "review_state", match: { value: "quarantined" } }],
    };
    const chunkFilter = {
      must: [{ key: "project_id", match: { value: projectId } }],
    };

    const [itemResults, chunkResults] = await Promise.all([
      qdrantRawSearch(COLLECTION, embedding, 20, itemFilter),
      qdrantRawSearch(CHUNKS_COLLECTION, embedding, 10, chunkFilter),
    ]);

    const sourcesCount = itemResults.length + chunkResults.length;

    if (sourcesCount === 0) {
      return NextResponse.json(
        { error: "No meeting data found for this project yet." },
        { status: 404 }
      );
    }

    // Build context string for the LLM
    const contextLines: string[] = [];
    for (const r of itemResults) {
      const p = r.payload;
      contextLines.push(
        `[${p.meeting_title || "Meeting"}] [${p.type || "item"}] ${p.text || ""}` +
          (p.owner ? ` (owner: ${p.owner})` : "")
      );
    }
    for (const r of chunkResults) {
      const p = r.payload;
      contextLines.push(`[${p.meeting_title || "Transcript"}] ${p.chunk_text || ""}`);
    }

    const { text: brief } = await generateText({
      model: generationModel,
      system: BRIEF_SYSTEM_PROMPT,
      prompt: `Project context (${sourcesCount} sources):\n\n${contextLines.join("\n")}`,
    });

    const generatedAt = new Date().toISOString();

    // Cache in Supabase — project_briefs table:
    //   id uuid pk, project_id uuid, brief_text text, generated_at timestamptz, sources_count int
    await supabase.from("project_briefs").insert({
      project_id: projectId,
      brief_text: brief.trim(),
      generated_at: generatedAt,
      sources_count: sourcesCount,
    });

    return NextResponse.json({
      brief: brief.trim(),
      generated_at: generatedAt,
      sources_count: sourcesCount,
    });
  } catch (error: any) {
    console.error("Brief generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
