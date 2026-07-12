import { NextRequest, NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { GENERATION_MODEL_NAME, generationModel, stripReasoning } from "@/lib/model";
import { embed, generateText } from "ai";
import { checkRateLimit, clientKey, sanitizeInput, securityHeaders } from "@/lib/security";
import { withLLMTrace } from "@/lib/observability";

const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");

const COLLECTION = process.env.QDRANT_COLLECTION || "meeting_items";
const CHUNKS_COLLECTION = "transcript_chunks";
const DOCUMENTS_COLLECTION = "documents";

const KNOWLEDGE_ASSISTANT_PROMPT = `You are Helm's knowledge assistant. Answer the user's question using ONLY the meeting context provided below. Rules:
- Cite sources inline with [Meeting Title].
- If a decision was superseded or overridden, mention it.
- Keep answers 2-4 sentences.
- If the context doesn't contain enough information, say so honestly — never fabricate facts.`;

// ---------------------------------------------------------------------------
// Raw Qdrant REST search — supports native payload filters that @mastra/qdrant
// does not expose. Returns results in { score, payload } shape.
// ---------------------------------------------------------------------------
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
    const msg = await res.text().catch(() => "");
    // Qdrant requires payload indexes for keyword filters. If the index hasn't been
    // created yet (first run before any pipeline upload), fall back to unfiltered
    // search and post-filter in JS so the route doesn't crash.
    if (res.status === 400 && msg.includes("Index required") && filter) {
      const fallback = await qdrantRawSearch(collection, vector, topK * 3);
      const mustNot: Array<{ key: string; match: { value: any } }> =
        (filter as any).must_not ?? [];
      if (!mustNot.length) return fallback.slice(0, topK);
      return fallback
        .filter((r) => !mustNot.some((c) => r.payload[c.key] === c.match?.value))
        .slice(0, topK);
    }
    throw new Error(`Qdrant REST ${collection} → ${res.status}: ${msg}`);
  }
  const data = await res.json();
  return (data.result || []).map((r: any) => ({
    score: r.score ?? 0,
    payload: r.payload ?? {},
  }));
}

// ---------------------------------------------------------------------------
// Shared: embed query + search both collections, return normalised results
// ---------------------------------------------------------------------------
async function searchBothCollections(query: string, topK = 10) {
  const { embedding } = await embed({ model: embeddingModel, value: query });

  const [itemResults, chunkResults, docResults] = await Promise.all([
    // meeting_items: exclude quarantined items (P2-9 filter)
    qdrantRawSearch(COLLECTION, embedding, 8, {
      must_not: [{ key: "review_state", match: { value: "quarantined" } }],
    }),
    // transcript_chunks: raw text, no filter needed
    qdrantRawSearch(CHUNKS_COLLECTION, embedding, 5),
    // documents: uploaded project documents
    qdrantRawSearch(DOCUMENTS_COLLECTION, embedding, 4),
  ]);

  const normalised: Array<{
    result_type: "item" | "chunk" | "document";
    text: string;
    type: string;
    owner: string;
    meeting_title: string;
    source_quote: string;
    supersedes_hint: string;
    trust_score: number;
    score: number;
  }> = [];

  for (const r of itemResults) {
    normalised.push({
      result_type: "item",
      text: r.payload.text || "",
      type: r.payload.type || "",
      owner: r.payload.owner || "unassigned",
      meeting_title: r.payload.meeting_title || "",
      source_quote: r.payload.source_quote || "",
      supersedes_hint: r.payload.supersedes_hint || "",
      trust_score: r.payload.trust_score ?? 0,
      score: Math.round(r.score * 1000) / 1000,
    });
  }

  for (const r of chunkResults) {
    normalised.push({
      result_type: "chunk",
      text: r.payload.chunk_text || "",
      type: "transcript_chunk",
      owner: "",
      meeting_title: r.payload.meeting_title || "",
      source_quote: "",
      supersedes_hint: "",
      trust_score: 1,
      score: Math.round(r.score * 1000) / 1000,
    });
  }

  for (const r of docResults) {
    normalised.push({
      result_type: "document",
      text: r.payload.chunk_text || "",
      type: "document",
      owner: "",
      meeting_title: r.payload.document_name || "",
      source_quote: "",
      supersedes_hint: "",
      trust_score: 1,
      score: Math.round(r.score * 1000) / 1000,
    });
  }

  normalised.sort((a, b) => b.score - a.score);
  return normalised.slice(0, topK);
}

// ---------------------------------------------------------------------------
// POST /api/search
// Body: { query: string, mode?: "search" | "ask" }
//   or: query param  ?mode=ask
//
// mode=search (default): returns { answer: null, results }
// mode=ask:             returns { answer: string, results } (top-5 context used for answer)
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    // Rate limit (60 req/min per client) — search + ask are LLM/Qdrant-heavy.
    if (!checkRateLimit(`search:${clientKey(req)}`, 60, 60_000)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again shortly." },
        { status: 429, headers: securityHeaders() }
      );
    }

    const body = await req.json();
    const { query: rawQuery, mode: bodyMode } = body;
    const urlMode = req.nextUrl.searchParams.get("mode");
    const mode = urlMode || bodyMode || "search";

    if (!rawQuery || typeof rawQuery !== "string") {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }
    // XSS-sanitize + length-cap the user-supplied query.
    const query = sanitizeInput(rawQuery);

    if (mode === "ask") {
      // ── Ask mode: retrieve top-5 context, generate a grounded answer ──────
      const contextResults = await searchBothCollections(query, 5);

      if (contextResults.length === 0) {
        return NextResponse.json({
          answer: "I don't have any meeting records relevant to your question yet.",
          results: [],
        });
      }

      // Build a compact context string for the LLM
      const contextStr = contextResults
        .map((r, i) => `[${i + 1}] [${r.meeting_title}] ${r.text}`)
        .join("\n");

      // "/no_think" keeps Qwen3 from emitting a long reasoning block (which can
      // hit Featherless's gateway timeout); stripReasoning() clears the residue.
      const prompt = `/no_think Context:\n${contextStr}\n\nQuestion: ${query}`;
      // Trace the LLM call (latency, tokens, prompt hash, status).
      const { text: answer } = await withLLMTrace(
        { model: GENERATION_MODEL_NAME, endpoint: "/api/search[ask]", prompt },
        () =>
          generateText({
            model: generationModel,
            system: KNOWLEDGE_ASSISTANT_PROMPT,
            prompt,
          })
      );

      return NextResponse.json(
        { answer: stripReasoning(answer), results: contextResults },
        { headers: securityHeaders() }
      );
    }

    // ── Search mode: dual-collection search, return raw ranked results ───────
    const results = await searchBothCollections(query, 10);
    return NextResponse.json({ answer: null, results }, { headers: securityHeaders() });
  } catch (error: any) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: error.message || "Search failed" },
      { status: 500 }
    );
  }
}
