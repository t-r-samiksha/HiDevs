import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// ---------------------------------------------------------------------------
// PII patterns — ordered so more specific patterns run before broader ones.
// Each pattern has a unique replacement label for transparency.
// ---------------------------------------------------------------------------
const PII_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // PAN card: 5 uppercase letters, 4 digits, 1 uppercase letter (e.g. ABCDE1234F)
  { pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g, label: "REDACTED_PAN" },
  // Credit card: 16 digits optionally grouped in 4s with spaces or dashes
  { pattern: /\b(?:\d{4}[\s\-]?){3}\d{4}\b/g, label: "REDACTED_CARD" },
  // Aadhaar: exactly 12 digits, optionally grouped as 4-4-4
  { pattern: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, label: "REDACTED_AADHAAR" },
  // Email address
  { pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, label: "REDACTED_EMAIL" },
  // Indian mobile: optional +91 prefix then 10-digit number starting with 6–9
  { pattern: /(?:\+91[\s\-]?)?[6-9]\d{9}\b/g, label: "REDACTED_PHONE" },
  // International phone: +country-code followed by 7–14 digits (loose match)
  {
    pattern: /\+(?!91\b)\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{3,5}[\s\-]?\d{4,8}/g,
    label: "REDACTED_PHONE",
  },
];

// ---------------------------------------------------------------------------
// Core redaction function — exported so it can be used inline in Next.js routes
// (cross-package import isn't possible from the Mastra backend, so the Next.js
// pipeline route duplicates this logic).
// ---------------------------------------------------------------------------
export function redactPII(text: string): { redacted: string; count: number } {
  let redacted = text;
  let count = 0;

  for (const { pattern, label } of PII_PATTERNS) {
    pattern.lastIndex = 0; // reset stateful global regex
    const matches = redacted.match(pattern);
    if (matches) {
      count += matches.length;
      redacted = redacted.replace(pattern, `[${label}]`);
    }
  }

  return { redacted, count };
}

// ---------------------------------------------------------------------------
// Zod schemas (mirrors pipeline/route.ts ScoredItemSchema)
// ---------------------------------------------------------------------------
const ScoredItemSchema = z.object({
  type: z.enum(["decision", "action_item"]),
  text: z.string(),
  owner: z.string().optional(),
  deadline: z
    .object({ raw: z.string(), resolved_iso: z.string().optional() })
    .optional(),
  dependency_hints: z.array(z.string()).optional(),
  supersedes_hint: z.string().optional(),
  source_quote: z.string(),
  source_timestamp: z.number().optional(),
  trust_score: z.number(),
  review_state: z.enum(["auto", "pending_review", "quarantined"]),
});

// ---------------------------------------------------------------------------
// Mastra tool — wired into the supervisor as Enkrypt Checkpoint 3
// ---------------------------------------------------------------------------
export const piiRedactorTool = createTool({
  id: "redact-pii",
  description:
    "Scan each item's text and source_quote for PII (emails, phone numbers, " +
    "credit card numbers, Aadhaar numbers, PAN numbers) and replace each match " +
    "with a [REDACTED_*] token. Run AFTER trust scoring and BEFORE persisting " +
    "to Supabase or Qdrant — this is Enkrypt Checkpoint 3.",
  inputSchema: z.object({
    items: z.array(ScoredItemSchema),
  }),
  outputSchema: z.object({
    redacted_items: z.array(ScoredItemSchema),
    pii_found: z.number(),
  }),
  execute: async (inputData) => {
    let totalFound = 0;
    const redacted_items = inputData.items.map((item) => {
      const textResult = redactPII(item.text);
      const quoteResult = redactPII(item.source_quote);
      totalFound += textResult.count + quoteResult.count;
      return {
        ...item,
        text: textResult.redacted,
        source_quote: quoteResult.redacted,
      };
    });
    return { redacted_items, pii_found: totalFound };
  },
});
