/**
 * Helm — extraction eval scorers (4 deterministic Mastra scorers).
 * Ported from Helm/src/mastra/scorers/extraction-scorer.ts, but self-contained:
 * the Helm version pulls `getAssistantMessageFromRunOutput` from @mastra/evals
 * (not installed in helm-web), so we inline an equivalent parser. These execute
 * live — in the pipeline after each extraction and via POST /api/evals/run.
 */

import { createScorer } from "@mastra/core/evals";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Pull the assistant's text out of whatever shape we handed the scorer. */
function assistantText(runOutput: unknown): string {
  if (typeof runOutput === "string") return runOutput;
  if (Array.isArray(runOutput)) {
    const last = runOutput[runOutput.length - 1] as { content?: unknown } | undefined;
    if (last && typeof last.content === "string") return last.content;
  }
  const o = runOutput as { text?: unknown; content?: unknown };
  if (o && typeof o.text === "string") return o.text;
  if (o && typeof o.content === "string") return o.content;
  return "";
}

function parseExtracted(runOutput: unknown): Array<Record<string, unknown>> {
  const cleaned = assistantText(runOutput).replace(/```json\s*/g, "").replace(/```/g, "").trim();
  try {
    return ((JSON.parse(cleaned) as { items?: unknown[] }).items as Array<Record<string, unknown>>) || [];
  } catch {
    return [];
  }
}

/** Jaccard similarity on words longer than 3 chars — good enough for item matching. */
function wordOverlap(a: string, b: string): number {
  const tokens = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const A = tokens(a);
  const B = tokens(b);
  const intersection = [...A].filter((w) => B.has(w)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : intersection / union;
}

function bestMatch(
  goldenText: string,
  candidates: Array<Record<string, unknown>>
): { item: Record<string, unknown> | null; score: number } {
  let best: Record<string, unknown> | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    const s = wordOverlap(goldenText, String(c.text || ""));
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return { item: bestScore > 0.05 ? best : null, score: bestScore };
}

type GoldenItem = { type: string; text: string; owner?: string; source_quote?: string };
type GoldenSet = { items: GoldenItem[] };

// ---------------------------------------------------------------------------
// Scorer 1 — item_count
// ---------------------------------------------------------------------------
export const itemCountScorer = createScorer({
  id: "extraction-item-count",
  name: "Extraction Item Count",
  description: "Checks the extracted item count against the golden set (1.0=exact, 0.8=±1, 0.5=±2).",
  type: "agent",
})
  .preprocess(({ run }) => {
    const extracted = parseExtracted(run.output);
    const golden = (run.groundTruth as GoldenSet)?.items || [];
    return { extractedCount: extracted.length, goldenCount: golden.length };
  })
  .generateScore(({ results }) => {
    const { extractedCount, goldenCount } = results.preprocessStepResult;
    const diff = Math.abs(extractedCount - goldenCount);
    if (diff === 0) return 1.0;
    if (diff === 1) return 0.8;
    if (diff === 2) return 0.5;
    return 0.0;
  })
  .generateReason(({ results, score }) => {
    const { extractedCount, goldenCount } = results.preprocessStepResult;
    return `Extracted ${extractedCount} items, golden has ${goldenCount} (diff=${Math.abs(
      extractedCount - goldenCount
    )}). Score=${score}.`;
  });

// ---------------------------------------------------------------------------
// Scorer 2 — owner_accuracy
// ---------------------------------------------------------------------------
export const ownerAccuracyScorer = createScorer({
  id: "extraction-owner-accuracy",
  name: "Extraction Owner Accuracy",
  description: "For each golden item naming an owner, checks the best-matching extracted item captured it.",
  type: "agent",
})
  .preprocess(({ run }) => {
    const extracted = parseExtracted(run.output);
    const golden: GoldenItem[] = (run.groundTruth as GoldenSet)?.items || [];
    let correct = 0;
    let total = 0;
    const missed: string[] = [];
    for (const gi of golden) {
      if (!gi.owner) continue;
      total++;
      const { item } = bestMatch(gi.text, extracted);
      const ok = String(item?.owner || "").trim().toLowerCase() === gi.owner.trim().toLowerCase();
      if (ok) correct++;
      else missed.push(`${gi.owner} on "${gi.text.slice(0, 40)}"`);
    }
    return { correct, total, missed };
  })
  .generateScore(({ results }) => {
    const { correct, total } = results.preprocessStepResult;
    return total === 0 ? 1.0 : correct / total;
  })
  .generateReason(({ results, score }) => {
    const { correct, total, missed } = results.preprocessStepResult;
    return `${correct}/${total} owners correct.${
      missed.length ? " Missing: " + missed.join("; ") : ""
    } Score=${score.toFixed(2)}.`;
  });

// ---------------------------------------------------------------------------
// Scorer 3 — type_accuracy
// ---------------------------------------------------------------------------
export const typeAccuracyScorer = createScorer({
  id: "extraction-type-accuracy",
  name: "Extraction Type Accuracy",
  description: "Checks the type (decision vs action_item) of each best-matched extracted item.",
  type: "agent",
})
  .preprocess(({ run }) => {
    const extracted = parseExtracted(run.output);
    const golden: GoldenItem[] = (run.groundTruth as GoldenSet)?.items || [];
    let correct = 0;
    const wrong: string[] = [];
    for (const gi of golden) {
      const { item } = bestMatch(gi.text, extracted);
      const got = String(item?.type || "");
      if (got === gi.type) correct++;
      else wrong.push(`got "${got || "none"}" for "${gi.text.slice(0, 35)}" (expected "${gi.type}")`);
    }
    return { correct, total: golden.length, wrong };
  })
  .generateScore(({ results }) => {
    const { correct, total } = results.preprocessStepResult;
    return total === 0 ? 1.0 : correct / total;
  })
  .generateReason(({ results, score }) => {
    const { correct, total, wrong } = results.preprocessStepResult;
    return `${correct}/${total} types correct.${
      wrong.length ? " Mistyped: " + wrong.join("; ") : ""
    } Score=${score.toFixed(2)}.`;
  });

// ---------------------------------------------------------------------------
// Scorer 4 — source_quote_presence
// ---------------------------------------------------------------------------
export const sourceQuotePresenceScorer = createScorer({
  id: "extraction-source-quote-presence",
  name: "Extraction Source Quote Presence",
  description: "Fraction of extracted items carrying a non-empty source_quote (backs Enkrypt adherence).",
  type: "agent",
})
  .preprocess(({ run }) => {
    const extracted = parseExtracted(run.output);
    const withQuote = extracted.filter(
      (it) => typeof it.source_quote === "string" && it.source_quote.trim().length > 0
    );
    return { withQuote: withQuote.length, total: extracted.length };
  })
  .generateScore(({ results }) => {
    const { withQuote, total } = results.preprocessStepResult;
    return total === 0 ? 1.0 : withQuote / total;
  })
  .generateReason(({ results, score }) => {
    const { withQuote, total } = results.preprocessStepResult;
    const missing = total - withQuote;
    return `${withQuote}/${total} items have a source_quote.${
      missing > 0 ? ` ${missing} missing it — those fail Enkrypt adherence.` : ""
    } Score=${score.toFixed(2)}.`;
  });

export const extractionScorers = {
  itemCountScorer,
  ownerAccuracyScorer,
  typeAccuracyScorer,
  sourceQuotePresenceScorer,
};

/**
 * Runs all 4 scorers against an extraction output + golden set. Returns a
 * compact per-scorer {score, reason}. Used by the pipeline and the eval route.
 */
export async function scoreExtraction(
  agentOutputText: string,
  goldenSet?: GoldenSet
): Promise<Record<string, { score: number; reason: string }>> {
  // "agent" scorers expect a message-array output; wrap our text accordingly.
  const output = [{ role: "assistant", content: agentOutputText }] as unknown;
  const out: Record<string, { score: number; reason: string }> = {};
  for (const [key, scorer] of Object.entries(extractionScorers)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await scorer.run({ output, groundTruth: goldenSet } as any);
      out[key] = { score: r.score as number, reason: (r.reason as string) ?? "" };
    } catch (e) {
      out[key] = { score: 0, reason: `scorer error: ${e instanceof Error ? e.message : "unknown"}` };
    }
  }
  return out;
}
