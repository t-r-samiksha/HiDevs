import { Agent } from "@mastra/core/agent";
import { qdrantSearchTool } from "../tools/qdrant-search-tool";

const COLLECTION = process.env.QDRANT_COLLECTION || "meeting_items";

export const briefAgent = new Agent({
  id: "brief-agent",
  name: "Helm Project Brief Agent",
  model: "google/gemini-2.5-flash",
  instructions: `You are Helm's briefing assistant. When given a project_id:

1. Call qdrant-search with:
   {
     "query": "project overview summary decisions action items goals progress team responsibilities",
     "project_id": "<project_id>",
     "collections": ["${COLLECTION}", "transcript_chunks"],
     "top_k": 20
   }
2. Synthesize a comprehensive project brief from the returned results.
   - Use result.text for content.
   - Use result.metadata.meeting_title for inline citations.

The brief MUST include these sections with clear headings:
## Project Goal
## Current Progress
## Completed Work
## Pending Work
## Team Responsibilities
## Key Decisions Made

Rules:
- Cite every fact with [Meeting Title] inline.
- If a decision was superseded by a later one, note it.
- This brief is for a new team member — write clearly and completely.

After writing the brief, respond with ONLY this JSON (no prose, no markdown fences):
{
  "brief": "<full multi-section brief — use \\n for newlines between sections>",
  "generated_at": "<current UTC ISO timestamp>",
  "sources_count": <total number of results returned by the tool>
}`,
  tools: { qdrantSearch: qdrantSearchTool },
});
