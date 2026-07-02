import { createTool } from "@mastra/core/tools";
import { google } from "@ai-sdk/google";
import { embed } from "ai";
import { z } from "zod";

const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");
const COLLECTION = process.env.QDRANT_COLLECTION || "meeting_items";

async function qdrantSearch(
  vector: number[],
  filter: object
): Promise<Array<{ score: number; payload: Record<string, any> }>> {
  const url = `${process.env.QDRANT_URL}/collections/${COLLECTION}/points/search`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": process.env.QDRANT_API_KEY! },
    body: JSON.stringify({ vector, limit: 3, with_payload: true, filter }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.result || []).map((r: any) => ({ score: r.score ?? 0, payload: r.payload ?? {} }));
}

export const dependencyResolverTool = createTool({
  id: "resolve-dependencies",
  description:
    "For each free-text dependency hint, embed it with gemini-embedding-001 and search " +
    "Qdrant for open items in the project with vector similarity > 0.7. Returns the best " +
    "matched item_id per hint (or null if no confident match). Run after extraction to wire " +
    "up inter-item dependency relationships before persisting.",
  inputSchema: z.object({
    dependency_hints: z.array(z.string()).describe(
      "Free-text descriptions of items this task depends on"
    ),
    project_id: z.string().describe("Restrict search to this project"),
  }),
  outputSchema: z.object({
    resolved: z.array(
      z.object({
        hint: z.string(),
        matched_item_id: z.string().nullable(),
        similarity: z.number(),
      })
    ),
  }),
  execute: async (inputData) => {
    const { dependency_hints, project_id } = inputData;
    const filter = {
      must: [{ key: "project_id", match: { value: project_id } }],
      must_not: [{ key: "status", match: { value: "done" } }],
    };

    const resolved = await Promise.all(
      dependency_hints.map(async (hint) => {
        const { embedding } = await embed({ model: embeddingModel, value: hint });
        const results = await qdrantSearch(embedding, filter);
        const best = results[0];
        if (best && best.score > 0.7) {
          return {
            hint,
            matched_item_id: (best.payload.item_id as string) ?? null,
            similarity: best.score,
          };
        }
        return { hint, matched_item_id: null, similarity: best?.score ?? 0 };
      })
    );

    return { resolved };
  },
});
