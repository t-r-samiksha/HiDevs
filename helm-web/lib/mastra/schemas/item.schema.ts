/**
 * Helm — shared Item schema (single source of truth for extraction output).
 * Ported from Helm/src/mastra/schemas/item.schema.ts so the deployed Next.js
 * app enforces the SAME Zod contract the Mastra project defines. Used by the
 * pipeline to `.safeParse()` the extraction agent's output and by the eval
 * scorers. zod v3-compatible.
 */

import { z } from "zod";

export const ItemType = z.enum(["decision", "action_item"]);
export type ItemType = z.infer<typeof ItemType>;

export const ItemStatus = z.enum(["open", "in_progress", "at_risk", "blocked", "done"]);
export type ItemStatus = z.infer<typeof ItemStatus>;

export const ReviewState = z.enum(["auto", "pending_review", "quarantined"]);
export type ReviewState = z.infer<typeof ReviewState>;

export const DeadlineSchema = z
  .object({
    raw: z.string().describe("The deadline exactly as spoken, e.g. 'before the demo', 'next Friday'."),
    resolved_iso: z
      .string()
      .optional()
      .describe("Best-effort ISO 8601 date if resolvable. Leave empty if genuinely ambiguous."),
  })
  .describe("A deadline mentioned in the meeting. Omit entirely if none was stated.");

export type Deadline = z.infer<typeof DeadlineSchema>;

export const ExtractedItemSchema = z.object({
  type: ItemType.describe(
    "'decision' = a choice the team committed to. 'action_item' = a task someone owns."
  ),
  text: z.string().min(1).describe("A single self-contained sentence stating the decision or task."),
  owner: z
    .string()
    .optional()
    .describe("The person responsible, as named in the meeting. Omit if none was stated."),
  deadline: DeadlineSchema.optional(),
  dependency_hints: z
    .array(z.string())
    .optional()
    .describe("Natural-language mentions that this item depends on / is blocked by something else."),
  supersedes_hint: z
    .string()
    .optional()
    .describe("If this decision overturns an earlier one, the phrase indicating that."),
  source_quote: z
    .string()
    .min(1)
    .describe("The exact words from the transcript this item is based on, quoted verbatim."),
  source_timestamp: z
    .number()
    .optional()
    .describe("Seconds from the start of the recording where source_quote begins, if known."),
});

export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

/** The full structured output the extraction agent returns for one transcript. */
export const ExtractionResultSchema = z
  .object({
    items: z
      .array(ExtractedItemSchema)
      .describe("Every decision and action item found. Empty array if none — do not pad."),
  })
  .describe("Structured extraction result for a single meeting transcript.");

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
