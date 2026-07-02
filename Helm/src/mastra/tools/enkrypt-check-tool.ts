import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const ENKRYPT_BASE = "https://api.enkryptai.com";

async function enkryptPost(path: string, body: unknown) {
  const res = await fetch(ENKRYPT_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.ENKRYPT_API_KEY! },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Enkrypt ${path} → ${res.status}`);
  return res.json();
}

export const enkryptCheckTool = createTool({
  id: "enkrypt-check",
  description:
    "Run an Enkrypt AI safety guardrail check. Supports injection detection, " +
    "adherence validation, relevancy scoring, PII detection, and policy compliance. " +
    "Returns a passed boolean, optional numeric score, and a human-readable detail string.",
  inputSchema: z.object({
    check_type: z.enum(["injection", "adherence", "relevancy", "pii", "policy"]),
    text: z.string().describe("The text to evaluate"),
    context: z.string().optional().describe(
      "For adherence: the source context the text must be grounded in"
    ),
    question: z.string().optional().describe(
      "For relevancy: the question the text must answer"
    ),
  }),
  outputSchema: z.object({
    passed: z.boolean(),
    score: z.number().optional(),
    flagged_text: z.string().optional(),
    details: z.string(),
  }),
  execute: async (inputData) => {
    const { check_type, text, context, question } = inputData;

    switch (check_type) {
      case "injection": {
        const r = await enkryptPost("/guardrails/detect", {
          text,
          detectors: { injection_attack: { enabled: true } },
        });
        const flagged = r.summary?.injection_attack === 1;
        const score = parseFloat(r.details?.injection_attack?.attack ?? "0") || 0;
        return { passed: !flagged, score, details: flagged ? "Injection attack detected" : "Safe" };
      }

      case "adherence": {
        const r = await enkryptPost("/guardrails/adherence", {
          context: context ?? text,
          llm_answer: text,
        });
        const score: number = r.summary?.adherence_score ?? 0;
        return {
          passed: score === 1.0,
          score,
          details: score === 1.0 ? "Adherent to source context" : "Not grounded in source context",
        };
      }

      case "relevancy": {
        const r = await enkryptPost("/guardrails/relevancy", {
          question: question ?? "",
          llm_answer: text,
        });
        const score: number = r.summary?.relevancy_score ?? 0;
        return {
          passed: score === 1.0,
          score,
          details: score === 1.0 ? "Relevant to the question" : "Off-topic for this meeting",
        };
      }

      case "pii": {
        const r = await enkryptPost("/guardrails/detect", {
          text,
          detectors: { pii: { enabled: true } },
        });
        const flagged = r.summary?.pii === 1;
        return {
          passed: !flagged,
          flagged_text: (r.details?.pii?.flagged_text as string | undefined),
          details: flagged ? "PII detected in text" : "No PII detected",
        };
      }

      case "policy": {
        const r = await enkryptPost("/guardrails/detect", {
          text,
          detectors: { policy_violation: { enabled: true } },
        });
        const flagged = r.summary?.policy_violation === 1;
        return {
          passed: !flagged,
          details: flagged ? "Policy violation detected" : "Policy compliant",
        };
      }
    }
  },
});
