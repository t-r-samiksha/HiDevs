import { Agent } from "@mastra/core/agent";
import { MASTRA_GEMINI_MODEL } from "@/lib/model";

/**
 * Extraction agent used by the eval runner (and registered in the Mastra
 * instance). Produces the ExtractionResultSchema shape: { items: [...] }.
 */
export const extractionAgent = new Agent({
  id: "extraction-agent",
  name: "Extraction Agent",
  model: MASTRA_GEMINI_MODEL,
  instructions: `You read a meeting transcript and extract every DECISION and ACTION ITEM.

Return ONLY JSON of the form:
{ "items": [ {
  "type": "decision" | "action_item",
  "text": "one self-contained sentence",
  "owner": "name, if stated (omit otherwise — never invent one)",
  "deadline": { "raw": "phrase as spoken", "resolved_iso": "YYYY-MM-DD if resolvable" },
  "dependency_hints": ["phrase indicating a blocker/dependency"],
  "source_quote": "the EXACT words from the transcript this is based on"
} ] }

Rules:
- source_quote is MANDATORY and must be verbatim from the transcript.
- Omit owner/deadline/dependency_hints when not stated — do not guess.
- Output ONLY the JSON object, no prose, no markdown fences.`,
});
