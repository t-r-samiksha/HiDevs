import { createScorer } from "@mastra/core/evals";
import { getAssistantMessageFromRunOutput } from "@mastra/evals/scorers/utils";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function parseExtracted(runOutput: unknown): Array<Record<string, unknown>> {
  const text = getAssistantMessageFromRunOutput(runOutput as any) || "";
  const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
  try {
    return (JSON.parse(cleaned) as { items?: unknown[] }).items as Array<Record<string, unknown>> || [];
  } catch {
    return [];
  }
}

/** Jaccard similarity on words longer than 3 chars — good enough for item matching. */
function wordOverlap(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
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

type GoldenItem = {
  type: string;
  text: string;
  owner?: string;
  source_quote?: string;
};

type GoldenSet = { items: GoldenItem[] };

// ---------------------------------------------------------------------------
// Scorer 1 — item_count
// ---------------------------------------------------------------------------

export const itemCountScorer = createScorer({
  id: "extraction-item-count",
  name: "Extraction Item Count",
  description:
    "Checks that the number of extracted items matches the golden set. " +
    "Score 1.0 = exact, 0.8 = ±1, 0.5 = ±2, 0.0 = further off.",
  type: "agent",
})
  .preprocess(({ run }) => {
    const extracted = parseExtracted(run.output);
    const golden = ((run.groundTruth as GoldenSet)?.items) || [];
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
    const diff = Math.abs(extractedCount - goldenCount);
    return `Extracted ${extractedCount} items, golden has ${goldenCount} (diff=${diff}). Score=${score}.`;
  });

// ---------------------------------------------------------------------------
// Scorer 2 — owner_accuracy
// ---------------------------------------------------------------------------

export const ownerAccuracyScorer = createScorer({
  id: "extraction-owner-accuracy",
  name: "Extraction Owner Accuracy",
  description:
    "For each golden item that names an owner, finds the best-matching extracted item " +
    "by text overlap and checks whether the owner was captured correctly.",
  type: "agent",
})
  .preprocess(({ run }) => {
    const extracted = parseExtracted(run.output);
    const golden: GoldenItem[] = ((run.groundTruth as GoldenSet)?.items) || [];

    const details: Array<{
      goldenText: string;
      goldenOwner: string;
      matchedText: string;
      matchedOwner: string;
      correct: boolean;
    }> = [];

    let correct = 0;
    let total = 0;

    for (const gi of golden) {
      if (!gi.owner) continue;
      total++;
      const { item } = bestMatch(gi.text, extracted);
      const extractedOwner = String(item?.owner || "").trim().toLowerCase();
      const goldenOwner = gi.owner.trim().toLowerCase();
      const isCorrect = extractedOwner === goldenOwner;
      if (isCorrect) correct++;
      details.push({
        goldenText: gi.text,
        goldenOwner: gi.owner,
        matchedText: String(item?.text || "(no match)"),
        matchedOwner: String(item?.owner || "(none)"),
        correct: isCorrect,
      });
    }

    return { correct, total, details };
  })
  .generateScore(({ results }) => {
    const { correct, total } = results.preprocessStepResult;
    return total === 0 ? 1.0 : correct / total;
  })
  .generateReason(({ results, score }) => {
    const { correct, total, details } = results.preprocessStepResult;
    const missed = details.filter((d) => !d.correct);
    const missedStr =
      missed.length > 0
        ? " Missing: " + missed.map((d) => `${d.goldenOwner} on "${d.goldenText.slice(0, 40)}"`).join("; ")
        : "";
    return `${correct}/${total} owners correct.${missedStr} Score=${score.toFixed(2)}.`;
  });

// ---------------------------------------------------------------------------
// Scorer 3 — type_accuracy
// ---------------------------------------------------------------------------

export const typeAccuracyScorer = createScorer({
  id: "extraction-type-accuracy",
  name: "Extraction Type Accuracy",
  description:
    "For each golden item, finds the best-matching extracted item and checks " +
    "that the type (decision vs action_item) matches.",
  type: "agent",
})
  .preprocess(({ run }) => {
    const extracted = parseExtracted(run.output);
    const golden: GoldenItem[] = ((run.groundTruth as GoldenSet)?.items) || [];

    const details: Array<{
      goldenText: string;
      goldenType: string;
      matchedText: string;
      matchedType: string;
      correct: boolean;
    }> = [];

    let correct = 0;

    for (const gi of golden) {
      const { item } = bestMatch(gi.text, extracted);
      const extractedType = String(item?.type || "");
      const isCorrect = extractedType === gi.type;
      if (isCorrect) correct++;
      details.push({
        goldenText: gi.text,
        goldenType: gi.type,
        matchedText: String(item?.text || "(no match)"),
        matchedType: extractedType || "(none)",
        correct: isCorrect,
      });
    }

    return { correct, total: golden.length, details };
  })
  .generateScore(({ results }) => {
    const { correct, total } = results.preprocessStepResult;
    return total === 0 ? 1.0 : correct / total;
  })
  .generateReason(({ results, score }) => {
    const { correct, total, details } = results.preprocessStepResult;
    const wrong = details.filter((d) => !d.correct);
    const wrongStr =
      wrong.length > 0
        ? " Mistyped: " +
          wrong
            .map(
              (d) =>
                `got "${d.matchedType}" for "${d.goldenText.slice(0, 35)}" (expected "${d.goldenType}")`
            )
            .join("; ")
        : "";
    return `${correct}/${total} types correct.${wrongStr} Score=${score.toFixed(2)}.`;
  });

// ---------------------------------------------------------------------------
// Scorer 4 — source_quote_presence
// ---------------------------------------------------------------------------

export const sourceQuotePresenceScorer = createScorer({
  id: "extraction-source-quote-presence",
  name: "Extraction Source Quote Presence",
  description:
    "Fraction of extracted items that carry a non-empty source_quote. " +
    "This field is mandatory per the schema and backs the Enkrypt adherence check.",
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
    return (
      `${withQuote}/${total} items have a source_quote.` +
      (missing > 0 ? ` ${missing} item(s) missing it — those will fail Enkrypt adherence.` : "") +
      ` Score=${score.toFixed(2)}.`
    );
  });
