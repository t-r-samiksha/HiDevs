// evals/eval-extraction.mjs
// ---------------------------------------------------------------------------
// Extraction accuracy eval — scored against hand-labeled golden set.
//
// Metrics (all deterministic, no LLM judge):
//   item_count          — extracted count matches golden count
//   owner_accuracy      — owners named correctly (matched by text overlap)
//   type_accuracy       — decision vs action_item typed correctly
//   source_quote_pres.  — every item carries a non-empty source_quote
//
// Run:  node --env-file=.env evals/eval-extraction.mjs
// ---------------------------------------------------------------------------

import { readFileSync } from "fs";
import { Agent } from "@mastra/core/agent";
import { createScorer, runEvals } from "@mastra/core/evals";
import { getAssistantMessageFromRunOutput } from "@mastra/evals/scorers/utils";

// ---------------------------------------------------------------------------
// Load eval data
// ---------------------------------------------------------------------------
const transcript = readFileSync(
  "evals/sampleTranscripts/transcript_01_kickoff.txt",
  "utf-8"
);
const golden = JSON.parse(
  readFileSync("evals/golden/golden_01_kickoff.json", "utf-8")
);

// ---------------------------------------------------------------------------
// Extraction agent (identical to src/mastra/agents/extraction-agent.ts)
// ---------------------------------------------------------------------------
const extractionAgent = new Agent({
  id: "extraction-agent-eval",
  name: "Extraction Agent",
  model: "google/gemini-2.5-flash",
  instructions: `
You read a meeting transcript and extract every DECISION and ACTION ITEM.
You are precise and conservative: you never invent details that were not said.

WHAT TO EXTRACT
- "decision": a choice the team committed to.
- "action_item": a task someone owns.

FOR EACH ITEM, PRODUCE THESE FIELDS
- type: "decision" or "action_item"
- text: one self-contained sentence stating the decision or task
- owner: the person responsible, named exactly as in the transcript. OMIT if none stated.
- deadline: { "raw": "..." } — the deadline as spoken. OMIT resolved_iso unless an explicit year is stated.
- dependency_hints: array of phrases showing this is blocked by something. OMIT if none.
- supersedes_hint: for decisions that reverse an earlier one. OMIT otherwise.
- source_quote: the EXACT words from the transcript this item is based on. Mandatory.
- source_timestamp: seconds from the [MM:SS] marker. OMIT if unknown.

RULES
- ONE item per distinct task or decision. Merge details discussed across lines into a single item.
- Only extract what was actually said. Prefer leaving optional fields out over guessing.
- Do not pad. Empty list if nothing found.

OUTPUT: ONLY a JSON object, no prose, no markdown fences:
{ "items": [ { ... } ] }
`,
});

// ---------------------------------------------------------------------------
// Shared helpers (mirrors extraction-scorer.ts, duplicated for .mjs compat)
// ---------------------------------------------------------------------------
function parseExtracted(runOutput) {
  const text = getAssistantMessageFromRunOutput(runOutput) || "";
  const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned).items || [];
  } catch {
    return [];
  }
}

function wordOverlap(a, b) {
  const tokens = (s) =>
    new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const A = tokens(a);
  const B = tokens(b);
  const intersection = [...A].filter((w) => B.has(w)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : intersection / union;
}

function bestMatch(goldenText, candidates) {
  let best = null;
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

// ---------------------------------------------------------------------------
// Scorer definitions (same logic as extraction-scorer.ts)
// ---------------------------------------------------------------------------

const itemCountScorer = createScorer({
  id: "extraction-item-count",
  name: "Item Count",
  description: "Extracted item count matches golden count",
  type: "agent",
})
  .preprocess(({ run }) => {
    const extracted = parseExtracted(run.output);
    const goldenItems = run.groundTruth?.items || [];
    return { extractedCount: extracted.length, goldenCount: goldenItems.length };
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
    return `Extracted ${extractedCount} items, golden has ${goldenCount} (diff=${Math.abs(extractedCount - goldenCount)}). Score=${score.toFixed(2)}.`;
  });

const ownerAccuracyScorer = createScorer({
  id: "extraction-owner-accuracy",
  name: "Owner Accuracy",
  description: "Owners named correctly for golden items that have one",
  type: "agent",
})
  .preprocess(({ run }) => {
    const extracted = parseExtracted(run.output);
    const goldenItems = run.groundTruth?.items || [];
    const details = [];
    let correct = 0;
    let total = 0;
    for (const gi of goldenItems) {
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
        matchedOwner: item?.owner || "(none)",
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
        ? " Missed: " +
          missed.map((d) => `${d.goldenOwner} → got "${d.matchedOwner}"`).join(", ")
        : "";
    return `${correct}/${total} owners correct.${missedStr} Score=${score.toFixed(2)}.`;
  });

const typeAccuracyScorer = createScorer({
  id: "extraction-type-accuracy",
  name: "Type Accuracy",
  description: "decision vs action_item classified correctly",
  type: "agent",
})
  .preprocess(({ run }) => {
    const extracted = parseExtracted(run.output);
    const goldenItems = run.groundTruth?.items || [];
    const details = [];
    let correct = 0;
    for (const gi of goldenItems) {
      const { item } = bestMatch(gi.text, extracted);
      const extractedType = item?.type || "";
      const isCorrect = extractedType === gi.type;
      if (isCorrect) correct++;
      details.push({
        goldenText: gi.text.slice(0, 50),
        goldenType: gi.type,
        matchedType: extractedType || "(none)",
        correct: isCorrect,
      });
    }
    return { correct, total: goldenItems.length, details };
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
        ? " Wrong: " +
          wrong
            .map((d) => `"${d.goldenText}" → got "${d.matchedType}" (expected "${d.goldenType}")`)
            .join("; ")
        : "";
    return `${correct}/${total} types correct.${wrongStr} Score=${score.toFixed(2)}.`;
  });

const sourceQuotePresenceScorer = createScorer({
  id: "extraction-source-quote-presence",
  name: "Source Quote Presence",
  description: "Fraction of extracted items with a non-empty source_quote",
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
      `${withQuote}/${total} items have source_quote.` +
      (missing > 0
        ? ` ${missing} missing — will fail Enkrypt adherence check.`
        : "") +
      ` Score=${score.toFixed(2)}.`
    );
  });

// ---------------------------------------------------------------------------
// Run the eval
// ---------------------------------------------------------------------------
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  HELM — Extraction Accuracy Eval");
console.log("  Transcript : evals/sampleTranscripts/transcript_01_kickoff.txt");
console.log("  Golden set : evals/golden/golden_01_kickoff.json");
console.log(`  Golden items: ${golden.items.length}`);
console.log("═══════════════════════════════════════════════════════════════\n");

// onItemComplete gives us the full per-item results (score + reason + details).
// runEvals final .scores is just averaged numbers — we print both.
let perItemResults = {};

const { scores, summary } = await runEvals({
  target: extractionAgent,
  data: [{ input: transcript, groundTruth: golden }],
  scorers: [
    itemCountScorer,
    ownerAccuracyScorer,
    typeAccuracyScorer,
    sourceQuotePresenceScorer,
  ],
  onItemComplete: ({ scorerResults }) => {
    // scorerResults: { [scorerId]: { score, reason, results } }
    perItemResults = scorerResults;
  },
});

// ---------------------------------------------------------------------------
// Pretty-print results
// ---------------------------------------------------------------------------
const SCORER_LABELS = {
  "extraction-item-count": "Item Count",
  "extraction-owner-accuracy": "Owner Accuracy",
  "extraction-type-accuracy": "Type Accuracy",
  "extraction-source-quote-presence": "Source Quote Presence",
};

const scoreBar = (s) => {
  const pct = Math.round(s * 10);
  return "█".repeat(pct) + "░".repeat(10 - pct) + " " + `${(s * 100).toFixed(0)}%`.padStart(4);
};

const passFail = (s) => (s >= 0.8 ? "✅ PASS" : s >= 0.5 ? "⚠️  WARN" : "❌ FAIL");

console.log("RESULTS\n");
console.log(`  ${"Metric".padEnd(28)} ${"Score".padEnd(18)} Status    Reason`);
console.log("  " + "─".repeat(90));

let totalScore = 0;
let count = 0;

for (const scorerId of Object.keys(SCORER_LABELS)) {
  const label = SCORER_LABELS[scorerId];
  // Use per-item result (has reason) if available, fall back to averaged score
  const full = perItemResults[scorerId];
  const score = full?.score ?? scores?.[scorerId] ?? 0;
  const reason = full?.reason ?? "";
  totalScore += score;
  count++;
  const reasonShort = reason.length > 40 ? reason.slice(0, 40) + "…" : reason;
  console.log(
    `  ${label.padEnd(28)} ${scoreBar(score).padEnd(18)} ${passFail(score)}  ${reasonShort}`
  );
}

const overall = count > 0 ? totalScore / count : 0;
console.log("  " + "─".repeat(90));
console.log(
  `  ${"OVERALL".padEnd(28)} ${scoreBar(overall).padEnd(18)} ${passFail(overall)}`
);
console.log(`\n  Items processed: ${summary.totalItems}`);

// Full reasons
console.log("\nDETAILS\n");
for (const scorerId of Object.keys(SCORER_LABELS)) {
  const label = SCORER_LABELS[scorerId];
  const full = perItemResults[scorerId];
  const reason = full?.reason ?? "(no reason captured)";
  console.log(`  [${label}]`);
  console.log(`    ${reason}`);
  console.log();
}

console.log("═══════════════════════════════════════════════════════════════\n");

// Exit non-zero if overall < 0.5 — useful in CI / hackathon grading scripts
if (overall < 0.5) {
  process.exit(1);
}
