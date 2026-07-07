/**
 * Pipeline supervisor workflow — a real Mastra workflow that orchestrates the
 * specialist extraction pipeline as explicit steps:
 *   extract (agent) → schema-validate (Zod) → trust-score (Enkrypt adherence +
 *   relevancy) → PII check (Enkrypt) → eval-score (Mastra scorers).
 *
 * This is the "supervisor orchestrating specialists" pattern, registered and
 * load-bearing. It runs independently of the production /api/pipeline route
 * (which writes to Qdrant/Supabase); this workflow is the reasoning/validation
 * supervisor and is callable via POST /api/pipeline/supervise.
 */
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { extractionAgent } from "../agents/extraction-agent";
import { ExtractionResultSchema } from "../schemas/item.schema";
import { scoreExtraction } from "../scorers/extraction-scorers";

const ENKRYPT_KEY = process.env.ENKRYPT_API_KEY!;
const ENKRYPT_BASE = "https://api.enkryptai.com";
const PII_ENTITIES = [
  "PERSON",
  "EMAIL_ADDRESS",
  "PHONE_NUMBER",
  "CREDIT_CARD",
  "US_SSN",
  "IP_ADDRESS",
  "IBAN_CODE",
  "US_PASSPORT",
  "LOCATION",
];

async function enkryptPost(path: string, body: unknown) {
  const res = await fetch(ENKRYPT_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ENKRYPT_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Enkrypt ${path} → ${res.status}: ${errBody}`);
  }
  return res.json();
}

const inputSchema = z.object({ transcript: z.string(), title: z.string().default("Untitled Meeting") });

const carrySchema = z.object({
  transcript: z.string(),
  title: z.string(),
  itemsJson: z.string(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: z.array(z.any()),
  schema_valid: z.boolean().default(true),
  schema_issues: z.number().default(0),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trust: z.array(z.any()).default([]),
  pii_flagged: z.boolean().default(false),
});

// Step 1 — extract with the agent, capture raw JSON for scoring.
const extractStep = createStep({
  id: "extract",
  description: "Run the extraction agent over the transcript",
  inputSchema,
  outputSchema: carrySchema,
  execute: async ({ inputData }) => {
    const response = await extractionAgent.generate([{ role: "user", content: inputData.transcript }]);
    const itemsJson = response.text.replace(/```json|```/g, "").trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let items: any[] = [];
    try {
      items = JSON.parse(itemsJson).items || [];
    } catch {
      /* leave empty */
    }
    return {
      transcript: inputData.transcript,
      title: inputData.title,
      itemsJson,
      items,
      schema_valid: true,
      schema_issues: 0,
      trust: [],
      pii_flagged: false,
    };
  },
});

// Step 2 — enforce the shared Zod schema.
const validateStep = createStep({
  id: "validate-schema",
  description: "Validate the extraction against ExtractionResultSchema",
  inputSchema: carrySchema,
  outputSchema: carrySchema,
  execute: async ({ inputData }) => {
    const parsed = ExtractionResultSchema.safeParse({ items: inputData.items });
    return { ...inputData, schema_valid: parsed.success, schema_issues: parsed.success ? 0 : parsed.error.issues.length };
  },
});

// Step 3 — Enkrypt Checkpoint 2: adherence + relevancy → trust score per item.
const trustStep = createStep({
  id: "trust-score",
  description: "Enkrypt adherence + relevancy per item → trust score + review state",
  inputSchema: carrySchema,
  outputSchema: carrySchema,
  execute: async ({ inputData }) => {
    const relevancyQ = `What decisions and action items were discussed in "${inputData.title}"?`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trust: any[] = [];
    for (const item of inputData.items) {
      let trust_score = 0;
      try {
        const adherenceR = await enkryptPost("/guardrails/adherence", {
          context: item.source_quote || "",
          llm_answer: item.text || "",
        });
        const relevancyR = await enkryptPost("/guardrails/relevancy", {
          question: relevancyQ,
          llm_answer: item.text || "",
        });
        const adherence = parseFloat(adherenceR.summary?.adherence_score) || 0;
        const relevancy = parseFloat(relevancyR.summary?.relevancy_score) || 0;
        trust_score = (adherence + relevancy) / 2;
      } catch (e) {
        console.error("[supervisor] trust scoring failed for an item:", e);
      }
      const review_state = trust_score > 0.85 ? "auto" : trust_score >= 0.6 ? "pending_review" : "quarantined";
      trust.push({ text: item.text, trust_score, review_state });
    }
    return { ...inputData, trust };
  },
});

// Step 4 — Enkrypt Checkpoint 3: PII check across item text + source quotes.
const piiStep = createStep({
  id: "pii-check",
  description: "Enkrypt PII detector across extracted item text and source quotes",
  inputSchema: carrySchema,
  outputSchema: carrySchema,
  execute: async ({ inputData }) => {
    let flagged = false;
    try {
      const joined = inputData.items
        .map((i) => `${i.text || ""} ${i.source_quote || ""}`)
        .join("\n")
        .slice(0, 8000);
      if (joined.trim()) {
        const r = await enkryptPost("/guardrails/detect", {
          text: joined,
          detectors: { pii: { enabled: true, entities: PII_ENTITIES } },
        });
        flagged = r.summary?.pii === 1;
      }
    } catch (e) {
      console.error("[supervisor] PII check failed:", e);
    }
    return { ...inputData, pii_flagged: flagged };
  },
});

// Step 5 — run the Mastra eval scorers on the extraction.
const scoreStep = createStep({
  id: "eval-score",
  description: "Score the extraction with the 4 Mastra extraction scorers",
  inputSchema: carrySchema,
  outputSchema: z.object({
    title: z.string(),
    item_count: z.number(),
    schema_valid: z.boolean(),
    schema_issues: z.number(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trust: z.array(z.any()),
    pii_flagged: z.boolean(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scores: z.record(z.string(), z.any()),
  }),
  execute: async ({ inputData }) => {
    const scores = await scoreExtraction(inputData.itemsJson);
    return {
      title: inputData.title,
      item_count: inputData.items.length,
      schema_valid: inputData.schema_valid,
      schema_issues: inputData.schema_issues,
      trust: inputData.trust,
      pii_flagged: inputData.pii_flagged,
      scores,
    };
  },
});

export const pipelineSupervisorWorkflow = createWorkflow({
  id: "pipeline-supervisor",
  description:
    "Supervisor workflow orchestrating the extraction pipeline as steps: extract → " +
    "schema-validate → Enkrypt trust-score → Enkrypt PII check → Mastra eval scoring.",
  inputSchema,
  outputSchema: scoreStep.outputSchema,
})
  .then(extractStep)
  .then(validateStep)
  .then(trustStep)
  .then(piiStep)
  .then(scoreStep);

pipelineSupervisorWorkflow.commit();
