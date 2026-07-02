import { Agent } from "@mastra/core/agent";
import { qdrantSearchTool } from "../tools/qdrant-search-tool";

const COLLECTION = process.env.QDRANT_COLLECTION || "meeting_items";

export const askAgent = new Agent({
  id: "ask-agent",
  name: "Helm Knowledge Assistant",
  model: "google/gemini-2.5-flash",
  instructions: `You are Helm's knowledge assistant. When given a question:

1. Call qdrant-search with:
   {
     "query": "<the question>",
     "collections": ["${COLLECTION}", "transcript_chunks", "documents"],
     "top_k": 5
   }
2. Answer the question using ONLY the results returned. Do not invent facts.
3. Cite sources using result.metadata.meeting_title as [Meeting Title] inline.
4. Skip any result where metadata.review_state = "quarantined".
5. Keep the answer 2-4 sentences. If context is insufficient, say so honestly.

After the tool completes, respond with ONLY this JSON (no prose, no markdown fences):
{
  "answer": "<your 2-4 sentence answer with inline [Meeting Title] citations>",
  "results": [<the results array returned by qdrant-search>]
}`,
  tools: { qdrantSearch: qdrantSearchTool },
});
