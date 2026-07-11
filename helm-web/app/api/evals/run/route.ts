import { NextResponse } from "next/server";
import { extractionAgent } from "@/lib/mastra/agents/extraction-agent";
import { scoreExtraction } from "@/lib/mastra/scorers/extraction-scorers";

// Golden set + transcript embedded so this runs anywhere (no fs / cross-package
// path). Hand-labelled ground truth for transcript_01_kickoff.
const GOLDEN_TRANSCRIPT = `[00:00] Priya: Okay, kicking off the Helm dashboard project. Let's lock the big technical calls today.
[00:14] Rahul: On storage — I think we go with MongoDB. It's quick to start and we don't have a fixed schema yet.
[00:29] Priya: Fine for now. Decision: we'll use MongoDB for the first cut. Rahul, can you stand up the database this week?
[00:41] Rahul: Yeah, I'll have the MongoDB instance and the base collections ready by Friday.
[01:03] Sreya: I'll take the dashboard UI. But heads up — I can't wire the live data until Rahul's database is actually up, so my work is blocked on his.
[01:18] Priya: Noted. Sreya owns the dashboard UI, depends on the database being ready. Let's target the UI shell by June 27th.
[01:35] Ananya: I'll handle the API tests once there's an endpoint to hit. No firm date yet, sometime after the UI shell.
[01:52] Priya: Good. Last thing — Ananya, can you also draft the deployment plan before the demo?
[02:04] Ananya: Sure, deployment plan before the demo.
[02:10] Priya: That's it. Thanks everyone.`;

const GOLDEN_SET = {
  items: [
    { type: "decision", text: "Use MongoDB for the first cut of the project.", source_quote: "Decision: we'll use MongoDB for the first cut." },
    { type: "action_item", text: "Stand up the MongoDB database and base collections.", owner: "Rahul", source_quote: "I'll have the MongoDB instance and the base collections ready by Friday." },
    { type: "action_item", text: "Build the dashboard UI.", owner: "Sreya", source_quote: "Sreya owns the dashboard UI, depends on the database being ready." },
    { type: "action_item", text: "Write the API tests.", owner: "Ananya", source_quote: "I'll handle the API tests once there's an endpoint to hit." },
    { type: "action_item", text: "Draft the deployment plan.", owner: "Ananya", source_quote: "deployment plan before the demo." },
  ],
};

// POST /api/evals/run — runs the extraction agent on the golden transcript and
// scores it with the 4 Mastra extraction scorers against the golden set. Gives
// judges a live, on-demand measure of extraction quality (not just claimed).
export async function POST() {
  try {
    const response = await extractionAgent.generate([{ role: "user", content: GOLDEN_TRANSCRIPT }]);
    // Reasoning models (e.g. Qwen3 via Featherless) prefix output with a
    // <think>...</think> block even for plain generation — extract from the
    // first '{' to the last '}' rather than just stripping code fences.
    const rawText = response.text;
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");
    const cleaned =
      firstBrace !== -1 && lastBrace !== -1
        ? rawText.slice(firstBrace, lastBrace + 1)
        : rawText.replace(/```json|```/g, "").trim();

    let extracted: unknown[] = [];
    try {
      extracted = (JSON.parse(cleaned).items as unknown[]) || [];
    } catch {
      /* leave empty — scorers will reflect the parse failure */
    }

    const scores = await scoreExtraction(cleaned, GOLDEN_SET);
    const overall =
      Object.values(scores).reduce((s, r) => s + r.score, 0) / Object.keys(scores).length;

    return NextResponse.json({
      golden_items: GOLDEN_SET.items.length,
      extracted_items: extracted.length,
      overall_score: Number(overall.toFixed(3)),
      scores,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Eval run error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET convenience — same as POST for easy browser testing.
export async function GET() {
  return POST();
}
