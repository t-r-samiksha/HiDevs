import { NextRequest, NextResponse } from "next/server";
import { QdrantVector } from "@mastra/qdrant";
import { google } from "@ai-sdk/google";
import { embed } from "ai";

const qdrant = new QdrantVector({
  id: "helm-search",
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
  https: true,
});

const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    // Find the right collection (handles timestamped fallback names)
    // let collectionName = "meeting_items";
    // try {
    //   const collections = await qdrant.listIndexes();
    //   const match = collections.find((c: string) => c.startsWith("meeting_items"));
    //   if (match) collectionName = match;
    // } catch {}

    const collectionName = process.env.QDRANT_COLLECTION || "meeting_items";

    // Embed the query
    const { embedding } = await embed({
      model: embeddingModel,
      value: query,
    });

    // Search Qdrant
    const results = await qdrant.query({
      indexName: collectionName,
      queryVector: embedding,
      topK: 5,
    });

    // Format results
    const formatted = results.map((r: any) => ({
      text: r.metadata?.text || "",
      type: r.metadata?.type || "",
      owner: r.metadata?.owner || "unassigned",
      meeting_title: r.metadata?.meeting_title || "",
      source_quote: r.metadata?.source_quote || "",
      supersedes_hint: r.metadata?.supersedes_hint || "",
      trust_score: r.metadata?.trust_score || 0,
      score: Math.round(r.score * 1000) / 1000,
    }));

    return NextResponse.json({ results: formatted });
  } catch (error: any) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: error.message || "Search failed" },
      { status: 500 }
    );
  }
}
