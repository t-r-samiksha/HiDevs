import { createTool } from "@mastra/core/tools";
import { google } from "@ai-sdk/google";
import { embed } from "ai";
import { z } from "zod";

const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");
const DEFAULT_COLLECTION = process.env.QDRANT_COLLECTION || "meeting_items";

async function rawSearch(
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
    headers: { "Content-Type": "application/json", "api-key": process.env.QDRANT_API_KEY! },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    return []; // best-effort: return empty on error rather than throw
  }
  const data = await res.json();
  return (data.result || []).map((r: any) => ({ score: r.score ?? 0, payload: r.payload ?? {} }));
}

export const qdrantSearchTool = createTool({
  id: "qdrant-search",
  description:
    "Embed a natural-language query with gemini-embedding-001 and search one or more " +
    "Qdrant collections (meeting_items, transcript_chunks, documents). Returns all hits " +
    "merged and sorted by similarity score. Quarantined items are excluded from " +
    "meeting_items by default. Use top_k to control per-collection result count.",
  inputSchema: z.object({
    query: z.string().describe("Natural-language search query"),
    collections: z.array(z.string()).optional().describe(
      "Collections to search. Defaults to [meeting_items]"
    ),
    project_id: z.string().optional().describe(
      "If set, restricts results to items belonging to this project"
    ),
    top_k: z.number().optional().describe(
      "Results per collection. Defaults to 5"
    ),
    exclude_quarantined: z.boolean().optional().describe(
      "Exclude quarantined items from meeting_items. Defaults to true"
    ),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        text: z.string(),
        score: z.number(),
        collection: z.string(),
        metadata: z.record(z.any()),
      })
    ),
  }),
  execute: async (inputData) => {
    const {
      query,
      collections = [DEFAULT_COLLECTION],
      project_id,
      top_k = 5,
      exclude_quarantined = true,
    } = inputData;

    const { embedding } = await embed({ model: embeddingModel, value: query });

    const perCollectionResults = await Promise.all(
      collections.map(async (col) => {
        const must: any[] = [];
        const must_not: any[] = [];
        if (project_id) must.push({ key: "project_id", match: { value: project_id } });
        if (exclude_quarantined && col === DEFAULT_COLLECTION) {
          must_not.push({ key: "review_state", match: { value: "quarantined" } });
        }
        const filter =
          must.length || must_not.length
            ? { ...(must.length ? { must } : {}), ...(must_not.length ? { must_not } : {}) }
            : undefined;

        const hits = await rawSearch(col, embedding, top_k, filter);
        return hits.map((r) => ({
          text: r.payload.text || r.payload.chunk_text || "",
          score: r.score,
          collection: col,
          metadata: r.payload,
        }));
      })
    );

    const merged = perCollectionResults.flat().sort((a, b) => b.score - a.score);
    return { results: merged };
  },
});
