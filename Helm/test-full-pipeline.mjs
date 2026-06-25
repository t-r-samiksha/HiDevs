// test-full-pipeline.mjs
// ---------------------------------------------------------------------------
// THE CONNECTED PIPELINE — the piece that turns everything into one flow:
//
//   1. Read transcript
//   2. Enkrypt injection check on raw transcript
//   3. Extract decisions + action items (Mastra agent)
//   4. For each item: Enkrypt adherence + relevancy → trust score
//   5. Store to Supabase (permanent DB)
//   6. Embed + store to Qdrant (vector memory)
//   7. Detect contradictions (supersedes_hint → flag)
//
// Run:  node --env-file=.env test-full-pipeline.mjs
// ---------------------------------------------------------------------------

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { Agent } from "@mastra/core/agent";
import { QdrantVector } from "@mastra/qdrant";
import { google } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const qdrant = new QdrantVector({
  id: "helm-qdrant",
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
  https: true,
});

const ENKRYPT_KEY = process.env.ENKRYPT_API_KEY;
const ENKRYPT_BASE = "https://api.enkryptai.com";
const COLLECTION = "meeting_items";
const DIMENSION = 3072;
let COLLECTION_ACTUAL = COLLECTION;
const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");

const PROJECT_ID = "a1b2c3d4-0000-0000-0000-000000000001"; // seeded project

// ---------------------------------------------------------------------------
// Extraction agent (same as your proven one)
// ---------------------------------------------------------------------------
const extractionAgent = new Agent({
  id: "extraction-agent",
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
// Enkrypt helpers (verified field names)
// ---------------------------------------------------------------------------
async function enkryptPost(path, body) {
  const res = await fetch(ENKRYPT_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ENKRYPT_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Enkrypt ${path} → ${res.status}`);
  return res.json();
}

async function checkInjection(text) {
  const r = await enkryptPost("/guardrails/detect", {
    text,
    detectors: { injection_attack: { enabled: true } },
  });
  const flagged = r.summary?.injection_attack === 1;
  const confidence = parseFloat(r.details?.injection_attack?.attack) || 0;
  return { flagged, confidence };
}

async function checkAdherence(context, llmAnswer) {
  const r = await enkryptPost("/guardrails/adherence", {
    context,
    llm_answer: llmAnswer,
  });
  return r.summary.adherence_score === 1.0;
}

async function checkRelevancy(question, llmAnswer) {
  const r = await enkryptPost("/guardrails/relevancy", {
    question,
    llm_answer: llmAnswer,
  });
  return r.summary.relevancy_score === 1.0;
}

function computeTrustScore(adherent, relevant, injectionFlagged) {
  if (!adherent) return 0.0;
  let score = relevant ? 0.9 : 0.7;
  if (injectionFlagged) score = Math.min(score, 0.4);
  return score;
}

function reviewState(score) {
  if (score >= 0.85) return "auto";
  if (score >= 0.6) return "pending_review";
  return "quarantined";
}

// ---------------------------------------------------------------------------
// Qdrant setup — handles the race condition on Qdrant Cloud deletion
// ---------------------------------------------------------------------------
async function ensureCollection() {
  try {
    await qdrant.deleteIndex(COLLECTION);
    console.log("   Deleted old collection...");
  } catch {}

  // Poll until it's actually gone (Qdrant Cloud is eventually consistent)
  let gone = false;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const existing = await qdrant.listIndexes();
      if (!existing.includes(COLLECTION)) {
        gone = true;
        break;
      }
    } catch {
      gone = true;
      break;
    }
  }

  if (!gone) {
    console.log("   Old collection still propagating — using a fresh name.");
    COLLECTION_ACTUAL = `${COLLECTION}_${Date.now()}`;
  } else {
    COLLECTION_ACTUAL = COLLECTION;
  }

  await qdrant.createIndex({
    indexName: COLLECTION_ACTUAL,
    dimension: DIMENSION,
    metric: "cosine",
  });
  console.log(`   ✅ Collection '${COLLECTION_ACTUAL}' ready (${DIMENSION}d)`);
}

// ---------------------------------------------------------------------------
// THE PIPELINE
// ---------------------------------------------------------------------------
async function runPipeline(transcriptPath, meetingTitle) {
  const transcript = readFileSync(transcriptPath, "utf-8");

  console.log(`\n📄 Processing: ${meetingTitle}`);
  console.log(`   File: ${transcriptPath}\n`);

  // ── Step 1: Enkrypt injection check on raw transcript ──
  console.log("🛡️  Step 1: Injection check on raw transcript...");
  const injection = await checkInjection(transcript);
  if (injection.flagged) {
    console.log(`   ⚠️  INJECTION DETECTED (${(injection.confidence * 100).toFixed(0)}% confidence) — halting pipeline.`);
    return;
  }
  console.log(`   ✅ Clean (attack probability: ${(injection.confidence * 100).toFixed(1)}%)`);

  // ── Step 2: Create meeting record in Supabase ──
  console.log("\n📝 Step 2: Creating meeting record...");
  const { data: meeting, error: meetingErr } = await supabase
    .from("meetings")
    .insert({
      title: meetingTitle,
      source_type: "upload",
      transcript_text: transcript,
      project_id: PROJECT_ID,
    })
    .select()
    .single();

  if (meetingErr) {
    console.log("   ❌ Failed to create meeting:", meetingErr.message);
    return;
  }
  console.log(`   ✅ Meeting created: ${meeting.id}`);

  // ── Step 3: Extract items ──
  console.log("\n🧠 Step 3: Extracting decisions + action items...");
  const response = await extractionAgent.generate([
    { role: "user", content: transcript },
  ]);

  let extracted;
  try {
    const cleaned = response.text.replace(/```json|```/g, "").trim();
    extracted = JSON.parse(cleaned);
  } catch {
    console.log("   ❌ Failed to parse extraction output:", response.text.slice(0, 200));
    return;
  }

  const items = extracted.items || [];
  console.log(`   ✅ Extracted ${items.length} items`);

  // ── Step 4: Enkrypt trust check + store each item ──
  console.log("\n🔍 Step 4: Trust scoring + storing items...\n");

  const relevancyQuestion = `What decisions and action items were discussed in this meeting titled "${meetingTitle}"?`;
  const storedItems = [];

  for (const item of items) {
    process.stdout.write(`   📋 "${item.text.slice(0, 50)}..." → `);

    // Adherence: use full transcript as wide context
    const adherent = await checkAdherence(transcript, item.text);
    const relevant = await checkRelevancy(relevancyQuestion, item.text);
    const score = computeTrustScore(adherent, relevant, injection.flagged);
    const state = reviewState(score);

    const icon = state === "auto" ? "✅" : state === "pending_review" ? "🟡" : "🔴";
    console.log(`${icon} trust=${score} → ${state}`);

    // Store to Supabase
    const { data: dbItem, error: itemErr } = await supabase
      .from("items")
      .insert({
        meeting_id: meeting.id,
        project_id: PROJECT_ID,
        type: item.type,
        text: item.text,
        owner: item.owner || null,
        deadline_raw: item.deadline?.raw || null,
        deadline_iso: item.deadline?.resolved_iso || null,
        status: "open",
        trust_score: score,
        review_state: state,
        source_quote: item.source_quote,
        source_timestamp: item.source_timestamp || null,
        dependency_hints: item.dependency_hints || [],
        supersedes_hint: item.supersedes_hint || null,
      })
      .select()
      .single();

    if (itemErr) {
      console.log(`      ❌ DB error: ${itemErr.message}`);
      continue;
    }

    storedItems.push({ ...dbItem, originalItem: item });

    // Small delay for Enkrypt rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  // ── Step 5: Embed + store to Qdrant ──
  console.log(`\n🧠 Step 5: Embedding ${storedItems.length} items to Qdrant...`);

  if (storedItems.length > 0) {
    const textsToEmbed = storedItems.map(
      (it) => `[${it.type}] ${it.text}${it.owner ? ` (owner: ${it.owner})` : ""}`
    );

    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: textsToEmbed,
    });

    const metadata = storedItems.map((it) => ({
      item_id: it.id,
      text: it.text,
      type: it.type,
      meeting_id: meeting.id,
      meeting_title: meetingTitle,
      owner: it.owner || "unassigned",
      status: it.status,
      trust_score: it.trust_score,
      source_quote: it.source_quote || "",
      supersedes_hint: it.supersedes_hint || "",
    }));

    await qdrant.upsert({
      indexName: COLLECTION_ACTUAL,
      vectors: embeddings,
      metadata,
    });

    console.log(`   ✅ Stored ${storedItems.length} vectors`);
  }

  // ── Step 6: Detect contradictions ──
  const supersedingItems = storedItems.filter((it) => it.supersedes_hint);
  if (supersedingItems.length > 0) {
    console.log(`\n⚠️  Step 6: ${supersedingItems.length} contradiction(s) detected`);

    for (const item of supersedingItems) {
      // Search Qdrant for the decision being superseded
      const { embedding } = await embed({
        model: embeddingModel,
        value: item.supersedes_hint,
      });

      const matches = await qdrant.query({
        indexName: COLLECTION_ACTUAL,
        queryVector: embedding,
        topK: 3,
      });

      // Find the best match that's a decision from a DIFFERENT meeting
      const superseded = matches.find(
        (m) => m.metadata.type === "decision" && m.metadata.meeting_id !== meeting.id
      );

      if (superseded) {
        await supabase.from("contradictions").insert({
          item_a_id: superseded.metadata.item_id,
          item_b_id: item.id,
          description: `"${item.text}" supersedes "${superseded.metadata.text}" — ${item.supersedes_hint}`,
        });
        console.log(`   📌 "${item.text.slice(0, 40)}..." supersedes "${superseded.metadata.text.slice(0, 40)}..."`);
      }
    }
  }

  console.log(`\n✅ Pipeline complete for "${meetingTitle}"`);
  return { meeting, items: storedItems };
}

// ---------------------------------------------------------------------------
// Run both transcripts through the pipeline
// ---------------------------------------------------------------------------
console.log("═══════════════════════════════════════════════════════════");
console.log("  HELM FULL PIPELINE — transcript to dashboard in one flow");
console.log("═══════════════════════════════════════════════════════════");

await ensureCollection();

// Meeting 1: Kickoff
await runPipeline(
  "evals/sampleTranscripts/transcript_01_kickoff.txt",
  "Helm Dashboard Kickoff"
);

// Small pause between meetings
await new Promise((r) => setTimeout(r, 2000));

// Meeting 2: Standup (has the DB reversal)
await runPipeline(
  "evals/sampleTranscripts/transcript_02_standup.txt",
  "Daily Standup — DB Change"
);

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  Check Supabase Table Editor → items table to see your");
console.log("  extracted items with trust scores stored permanently.");
console.log("═══════════════════════════════════════════════════════════");
