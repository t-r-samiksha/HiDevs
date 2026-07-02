import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const PointSchema = z.object({
  id: z.string().describe("Stable UUID for this vector point"),
  vector: z.array(z.number()).describe("Embedding vector"),
  payload: z.record(z.any()).describe("Metadata stored alongside the vector"),
});

export const qdrantWriteTool = createTool({
  id: "qdrant-write",
  description:
    "Upsert one or more vector points into a Qdrant collection. Ensures the collection " +
    "exists with Cosine distance before writing (idempotent). Use for storing embeddings " +
    "of meeting items, transcript chunks, or project documents.",
  inputSchema: z.object({
    collection: z.string().describe("Target Qdrant collection name"),
    points: z.array(PointSchema).describe("Vector points to upsert"),
    vector_size: z.number().optional().describe(
      "Embedding dimension. Defaults to 768 (gemini-embedding-001)"
    ),
  }),
  outputSchema: z.object({ upserted: z.number() }),
  execute: async (inputData) => {
    const { collection, points, vector_size = 768 } = inputData;
    const base = process.env.QDRANT_URL!;
    const headers = {
      "Content-Type": "application/json",
      "api-key": process.env.QDRANT_API_KEY!,
    };

    // Ensure collection exists (409 = already exists, safe to ignore)
    const createRes = await fetch(`${base}/collections/${collection}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ vectors: { size: vector_size, distance: "Cosine" } }),
    });
    if (!createRes.ok && createRes.status !== 409) {
      const msg = await createRes.text().catch(() => "");
      if (!msg.toLowerCase().includes("already exists")) {
        throw new Error(`Qdrant collection create ${collection} → ${createRes.status}: ${msg}`);
      }
    }

    // Upsert points
    const upsertRes = await fetch(`${base}/collections/${collection}/points`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ points }),
    });
    if (!upsertRes.ok) {
      const msg = await upsertRes.text().catch(() => "");
      throw new Error(`Qdrant write ${collection} → ${upsertRes.status}: ${msg}`);
    }

    return { upserted: points.length };
  },
});
