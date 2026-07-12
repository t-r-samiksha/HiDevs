import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Agent } from "@mastra/core/agent";
import { QdrantVector } from "@mastra/qdrant";
import { google } from "@ai-sdk/google";
import { embed, embedMany } from "ai";
import { z } from "zod";
import { addSpeakerLabels, applySpeakerTimeline } from "@/lib/diarize";
import { ExtractionResultSchema } from "@/lib/mastra/schemas/item.schema";
import { scoreExtraction } from "@/lib/mastra/scorers/extraction-scorers";
import { generationModel, GENERATION_MODEL_NAME } from "@/lib/model";
import { withLLMTrace } from "@/lib/observability";
import { checkRateLimit, sanitizeInput } from "@/lib/security";

// This route runs many sequential LLM + Enkrypt + Qdrant calls, so it needs a
// long execution window. Vercel Hobby caps at 60s; Pro/Enterprise honour up to
// 300s. On a platform without a hard cap (e.g. Railway) it runs to completion.
export const runtime = "nodejs";
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const qdrant = new QdrantVector({
  id: "helm-pipeline",
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
  https: true,
});

const ENKRYPT_KEY = process.env.ENKRYPT_API_KEY!;
const ENKRYPT_BASE = "https://api.enkryptai.com";
const COLLECTION = process.env.QDRANT_COLLECTION || "meeting_items";
const CHUNKS_COLLECTION = "transcript_chunks";
const PROJECT_ID = "a1b2c3d4-0000-0000-0000-000000000001";
const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");

// ---------------------------------------------------------------------------
// Extraction agent (inline — avoids cross-package import from Mastra backend)
// This is the only LLM call left in the pipeline. It's plain text generation
// (no tool-calling), so it doesn't need Gemini's constrained-decoding
// guarantee the way multi-tool orchestration did — see lib/model.ts for why
// the pipeline used to run a supervisor agent that dynamically chose which
// of 7 tools to call next, and why that was replaced with the plain
// sequential code below.
// ---------------------------------------------------------------------------
const extractionAgent = new Agent({
  id: "extraction-agent",
  name: "Extraction Agent",
  model: generationModel,
  instructions: `
You read a meeting transcript and extract every DECISION and ACTION ITEM —
including ones that are uncertain, secondhand, or hedged ("I think someone
agreed…", "I might be misremembering…", "as I understood it…").
Do NOT skip a line just because the speaker is unsure; extract the potential
commitment and let downstream review decide its validity.
Do NOT invent people, numbers, or facts that are completely absent from the
transcript, but DO extract commitments that are implied or reported.

Transcript lines are formatted "[MM:SS] SpeakerName: text". Use the speaker
label to resolve first-person pronouns ("I", "me", "my") to that speaker's
name when a line commits to something in first person — e.g. "[00:28] Ramesh:
I will work on the dashboard." means owner is "Ramesh", not "the speaker".
Never write "the speaker" or "I" as an owner in the extracted text — always
substitute the resolved name from the speaker label.

FOR EACH ITEM, PRODUCE:
- type: "decision" or "action_item"
- text: one self-contained sentence stating the commitment as a fact
- owner: person responsible, as named (resolved from the speaker label if the
  commitment was first-person). OMIT if truly no speaker label or name exists.
- deadline: { "raw": "..." } — as spoken. OMIT resolved_iso unless explicit year.
- dependency_hints: array of blocking phrases. OMIT if none.
- supersedes_hint: for decisions reversing earlier ones. OMIT otherwise.
- source_quote: EXACT words from transcript. Mandatory.
- source_timestamp: seconds from [MM:SS] marker. OMIT if unknown.

RULES
- ONE item per distinct task/decision. Merge across lines.
- Extract reported/secondhand commitments ("Alex confirmed he'll…") as items.

OUTPUT: ONLY JSON, no prose: { "items": [ { ... } ] }
`,
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
async function enkryptPost(path: string, body: unknown) {
  const res = await fetch(ENKRYPT_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ENKRYPT_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Surface the actual Enkrypt error body, not just the status — a 400 here
    // tells you exactly which field is wrong (e.g. "Missing pii.entities").
    const errBody = await res.text().catch(() => "");
    throw new Error(`Enkrypt ${path} → ${res.status}: ${errBody}`);
  }
  return res.json();
}

// Narrow adherence context to the transcript line containing source_quote.
function buildAdherenceContext(transcript: string, sourceQuote: string): string {
  if (!sourceQuote) return transcript;
  const lines = transcript.split("\n");
  for (const line of lines) {
    if (line.includes(sourceQuote.trim().slice(0, 40))) return line.trim();
  }
  return sourceQuote;
}

// ---------------------------------------------------------------------------
// PII redaction — inline copy of src/mastra/tools/pii-redactor.ts logic.
// Duplicate is intentional: cross-package imports between Mastra backend and
// Next.js are not supported. The canonical source is in the Mastra tools dir.
// ---------------------------------------------------------------------------
const PII_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g, label: "REDACTED_PAN" },
  { pattern: /\b(?:\d{4}[\s\-]?){3}\d{4}\b/g, label: "REDACTED_CARD" },
  { pattern: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, label: "REDACTED_AADHAAR" },
  { pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, label: "REDACTED_EMAIL" },
  { pattern: /(?:\+91[\s\-]?)?[6-9]\d{9}\b/g, label: "REDACTED_PHONE" },
  { pattern: /\+(?!91\b)\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{3,5}[\s\-]?\d{4,8}/g, label: "REDACTED_PHONE" },
];

function redactPII(text: string): { redacted: string; count: number } {
  let redacted = text;
  let count = 0;
  for (const { pattern, label } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = redacted.match(pattern);
    if (matches) {
      count += matches.length;
      redacted = redacted.replace(pattern, `[${label}]`);
    }
  }
  return { redacted, count };
}

// ---------------------------------------------------------------------------
// Transcript chunker — splits by speaker turn / ~45-second windows.
// Gracefully handles transcripts that have no [MM:SS] timestamps: falls back
// to grouping by line count only (every 6 lines = one chunk).
// Returns { text, startTime, endTime } for each chunk.
// ---------------------------------------------------------------------------
function chunkTranscript(
  transcript: string,
  windowSecs = 45
): Array<{ text: string; startTime: number; endTime: number }> {
  // Filter out comment lines (# ...) and blank lines
  const lines = transcript
    .split("\n")
    .filter((l) => l.trim() && !l.trimStart().startsWith("#"));

  if (lines.length === 0) return [];

  // Returns null when line has no [MM:SS] prefix — graceful no-op for non-timestamped transcripts
  function parseSeconds(line: string): number | null {
    const m = line.match(/^\[(\d+):(\d+)\]/);
    return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
  }

  const chunks: Array<{ text: string; startTime: number; endTime: number }> = [];
  let currentLines: string[] = [];
  let chunkStartTime = parseSeconds(lines[0]) ?? 0;

  for (const line of lines) {
    const t = parseSeconds(line);

    if (currentLines.length === 0) {
      chunkStartTime = t ?? chunkStartTime;
      currentLines.push(line);
      continue;
    }

    // Only use time-based splitting when the line carries a real timestamp.
    // Without timestamps, fall back to pure line-count grouping (every 6 lines).
    const timeExceeded = t !== null && t - chunkStartTime >= windowSecs;

    if (timeExceeded || currentLines.length >= 6) {
      chunks.push({
        text: currentLines.join("\n"),
        startTime: chunkStartTime,
        endTime: t ?? chunkStartTime + windowSecs,
      });
      currentLines = [line];
      chunkStartTime = t ?? chunkStartTime + windowSecs;
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    chunks.push({
      text: currentLines.join("\n"),
      startTime: chunkStartTime,
      endTime: chunkStartTime + windowSecs,
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Raw Qdrant REST search — used wherever @mastra/qdrant lacks filter support.
// Returns results in { score, payload } shape.
// ---------------------------------------------------------------------------
async function qdrantRawSearch(
  collection: string,
  vector: number[],
  topK: number,
  filter?: object
): Promise<Array<{ score: number; payload: Record<string, any> }>> {
  const url = `${process.env.QDRANT_URL}/collections/${collection}/points/search`;
  const body: Record<string, any> = { vector, limit: topK, with_payload: true };
  if (filter) body.filter = filter;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.QDRANT_API_KEY!,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 404) return []; // collection doesn't exist yet — not an error
    const msg = await res.text().catch(() => "");
    throw new Error(`Qdrant REST search ${collection} → ${res.status}: ${msg}`);
  }
  const data = await res.json();
  return (data.result || []).map((r: any) => ({
    score: r.score ?? 0,
    payload: r.payload ?? {},
  }));
}

// ---------------------------------------------------------------------------
// Zod schemas shared by pipeline steps
// ---------------------------------------------------------------------------
const ExtractedItemSchema = z.object({
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
});

// Real per-check Enkrypt scores, carried alongside each item so the trust
// detail endpoint can return actual data instead of reverse-engineering a
// guess from the single trust_score number.
const EnkryptChecksSchema = z.object({
  adherence_score: z.number(),
  relevancy_score: z.number(),
  financial_claim: z.boolean(),
});

const ScoredItemSchema = ExtractedItemSchema.extend({
  trust_score: z.number(),
  review_state: z.enum(["auto", "pending_review", "quarantined"]),
  enkrypt_checks: EnkryptChecksSchema,
});

// StoredItemSchema includes dependency_hints so they can be forwarded to the
// dependency-resolution step without a round-trip to Supabase.
const StoredItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.string(),
  owner: z.string().nullable(),
  trust_score: z.number(),
  review_state: z.string(),
  supersedes_hint: z.string().nullable(),
  dependency_hints: z.array(z.string()),
});

type ExtractedItem = z.infer<typeof ExtractedItemSchema>;
type ScoredItem = z.infer<typeof ScoredItemSchema>;
type StoredItem = z.infer<typeof StoredItemSchema>;

// ---------------------------------------------------------------------------
// Enkrypt Checkpoint 1: prompt-injection check on the raw transcript.
// Called directly from the route handler so the halt is a real code-level
// branch.
// ---------------------------------------------------------------------------
async function runInjectionCheck(text: string): Promise<{ safe: boolean; confidence: number }> {
  const r = await enkryptPost("/guardrails/detect", {
    text,
    detectors: { injection_attack: { enabled: true } },
  });
  const flagged = r.summary?.injection_attack === 1;
  const confidence = parseFloat(r.details?.injection_attack?.attack) || 0;
  return { safe: !flagged, confidence };
}

// ---------------------------------------------------------------------------
// Step 2: Extract items
// ---------------------------------------------------------------------------
async function runExtraction(transcript: string): Promise<{ items: ExtractedItem[] }> {
  const RETRY_DELAYS = [5_000, 15_000, 30_000];
  let response: Awaited<ReturnType<typeof extractionAgent.generate>> | undefined;

  for (let attempt = 0; ; attempt++) {
    try {
      response = await withLLMTrace(
        { model: GENERATION_MODEL_NAME, endpoint: "/api/pipeline", label: "pipeline-extraction" },
        () => extractionAgent.generate([{ role: "user", content: transcript }])
      );
      break;
    } catch (err: any) {
      const msg = String(err?.message || "");
      const isThrottle = msg.includes("high demand") || msg.includes("429") || err?.status === 429;
      // A daily free-tier quota exhaustion won't recover in seconds — don't
      // burn minutes retrying it; fail fast so the caller degrades gracefully.
      const isDailyQuota =
        msg.includes("free_tier") || msg.includes("PerDay") || msg.includes("RESOURCE_EXHAUSTED");
      if (!isThrottle || isDailyQuota || attempt >= RETRY_DELAYS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }

  // Reasoning models (e.g. Qwen3 via Featherless) prefix output with a
  // <think>...</think> block even for plain non-tool-calling generation.
  // Stripping fenced code blocks isn't enough on its own, so extract from
  // the first '{' to the last '}' — robust to any preamble/postamble noise
  // regardless of tag format.
  const raw = response!.text;
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  const cleaned =
    firstBrace !== -1 && lastBrace !== -1
      ? raw.slice(firstBrace, lastBrace + 1)
      : raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  // FIX 5 — schema-enforce the extraction output against the shared Zod
  // contract. On failure we log and fall back gracefully (keep the parsed
  // items) rather than dropping the extraction.
  const validation = ExtractionResultSchema.safeParse({ items: parsed.items || [] });
  if (!validation.success) {
    console.warn(
      "[pipeline] extraction failed schema validation:",
      JSON.stringify(validation.error.issues.slice(0, 5))
    );
  }

  // FIX 4 — run the Mastra extraction scorers live on this extraction. No
  // golden set exists at runtime, so source_quote presence is the meaningful
  // signal; the point is that the real scorers EXECUTE in the live pipeline.
  try {
    const scores = await scoreExtraction(cleaned);
    console.log("[pipeline] extraction scorers:", JSON.stringify(scores));
  } catch (e) {
    console.error("[pipeline] scorer run failed:", e);
  }

  return { items: parsed.items || [] };
}

// ---------------------------------------------------------------------------
// Step 3: Trust-score every item (Enkrypt Checkpoints 2 + 3)
// ---------------------------------------------------------------------------
async function scoreTrustItems(input: {
  items: ExtractedItem[];
  transcript: string;
  meeting_title: string;
}): Promise<{ scored_items: ScoredItem[] }> {
  const { items, transcript, meeting_title } = input;
  const relevancyQ = `What decisions and action items were discussed in "${meeting_title}"?`;
  const scored: ScoredItem[] = [];

  for (const item of items) {
    const ctx = buildAdherenceContext(transcript, item.source_quote || "");
    const adherenceR = await enkryptPost("/guardrails/adherence", {
      context: ctx,
      llm_answer: item.text,
    });
    const adherenceScore = parseFloat(adherenceR.summary?.adherence_score) || 0;
    const adherent = adherenceScore === 1.0;

    const relevancyR = await enkryptPost("/guardrails/relevancy", {
      question: relevancyQ,
      llm_answer: item.text,
    });
    const relevancyScore = parseFloat(relevancyR.summary?.relevancy_score) || 0;
    const relevant = relevancyScore === 1.0;

    // Four trust tiers:
    //   0.9  adherent + relevant          → auto
    //   0.7  adherent, off-topic          → pending_review
    //   0.4  adherent, off-topic + dollar → quarantined (unverifiable financial claim)
    //   0.0  not adherent                 → quarantined (hallucination)
    const hasFinancialClaim = /\$\d/.test(item.text);
    const trust_score = !adherent ? 0.0 : relevant ? 0.9 : hasFinancialClaim ? 0.4 : 0.7;
    const review_state =
      trust_score >= 0.85
        ? "auto"
        : trust_score >= 0.6
        ? "pending_review"
        : "quarantined";

    scored.push({
      ...item,
      trust_score,
      review_state,
      enkrypt_checks: {
        adherence_score: adherenceScore,
        relevancy_score: relevancyScore,
        financial_claim: hasFinancialClaim,
      },
    });
    await new Promise((r) => setTimeout(r, 800));
  }

  return { scored_items: scored };
}

// ---------------------------------------------------------------------------
// Enkrypt Checkpoint 3: real PII detection call. Enkrypt's PII detector
// returns a flag/score, not confirmed replaceable spans, so it's used as the
// authoritative detection signal; the local regex below remains the actual
// redaction mechanism since it's the only piece that knows *where* to redact.
// ---------------------------------------------------------------------------
// The Enkrypt PII detector (unlike injection_attack) requires an explicit list
// of entity types to look for — omitting it 400s with "Missing pii.entities".
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

async function enkryptPiiCheck(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    const r = await enkryptPost("/guardrails/detect", {
      text,
      detectors: { pii: { enabled: true, entities: PII_ENTITIES } },
    });
    return r.summary?.pii === 1;
  } catch (err) {
    // Fallback: rely on the local regex redactor. Logs the full Enkrypt error
    // body (enkryptPost now includes it) so failures are debuggable.
    console.error("Enkrypt PII check failed, relying on local regex only:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Step 4: PII redaction — Enkrypt Checkpoint 3
// Runs AFTER trust scoring and BEFORE any data reaches Supabase or Qdrant.
// ---------------------------------------------------------------------------
async function piiRedact(input: { items: ScoredItem[] }): Promise<{
  redacted_items: ScoredItem[];
  pii_found: number;
  enkrypt_pii_flagged: number;
}> {
  let totalFound = 0;
  let enkryptFlagged = 0;
  const redacted_items: ScoredItem[] = [];

  for (const item of input.items) {
    const [textFlagged, quoteFlagged] = await Promise.all([
      enkryptPiiCheck(item.text),
      enkryptPiiCheck(item.source_quote),
    ]);
    if (textFlagged || quoteFlagged) enkryptFlagged++;

    const textResult = redactPII(item.text);
    const quoteResult = redactPII(item.source_quote);
    totalFound += textResult.count + quoteResult.count;

    if ((textFlagged || quoteFlagged) && textResult.count === 0 && quoteResult.count === 0) {
      console.warn(
        `Enkrypt flagged PII that the local regex missed in item: "${item.text.slice(0, 60)}…"`
      );
    }

    redacted_items.push({ ...item, text: textResult.redacted, source_quote: quoteResult.redacted });
  }

  return { redacted_items, pii_found: totalFound, enkrypt_pii_flagged: enkryptFlagged };
}

// ---------------------------------------------------------------------------
// Step 5: Persist to Supabase + embed items to Qdrant (meeting_items)
// ---------------------------------------------------------------------------
async function persistPipeline(input: {
  meeting_title: string;
  transcript: string;
  scored_items: ScoredItem[];
}): Promise<{
  meeting_id: string;
  stored_items: StoredItem[];
  items_auto: number;
  items_review: number;
  items_quarantined: number;
}> {
  const { meeting_title, transcript, scored_items } = input;

  const { data: meeting, error: meetingErr } = await supabase
    .from("meetings")
    .insert({
      title: meeting_title,
      date: new Date().toISOString(),
      source_type: "upload",
      transcript_text: transcript,
      project_id: PROJECT_ID,
    })
    .select()
    .single();
  if (meetingErr) throw new Error(meetingErr.message);

  // FIX 1 — resolve owner NAMES to real users so follow-ups know who to email.
  // Exactly-one name match → assign id + email. Ambiguous/none → leave for
  // manual assignment (owner name stays as-is so filtering still works).
  const { data: allUsers } = await supabase.from("users").select("id, name, email");
  const usersByName = new Map<string, { id: string; email: string }[]>();
  for (const u of allUsers || []) {
    const k = String(u.name || "").trim().toLowerCase();
    if (!k) continue;
    if (!usersByName.has(k)) usersByName.set(k, []);
    usersByName.get(k)!.push({ id: u.id, email: u.email });
  }
  function resolveOwner(name: string | null): {
    owner_id: string | null;
    owner_email: string | null;
    ambiguous: boolean;
  } {
    const matches = name ? usersByName.get(name.trim().toLowerCase()) ?? [] : [];
    if (matches.length === 1) {
      return { owner_id: matches[0].id, owner_email: matches[0].email, ambiguous: false };
    }
    // >1 match → can't safely auto-assign; a manager picks the right person in /review.
    return { owner_id: null, owner_email: null, ambiguous: matches.length > 1 };
  }

  const storedItems: StoredItem[] = [];

  for (const item of scored_items) {
    const { owner_id, owner_email, ambiguous } = resolveOwner(item.owner || null);
    // Ambiguous owner → route to the review queue for manual assignment, even
    // if the trust score is high enough to auto-file.
    const reviewReason = ambiguous
      ? `Multiple users named '${item.owner}' — manual assignment needed`
      : null;
    const basePayload = {
      meeting_id: meeting.id,
      project_id: PROJECT_ID,
      type: item.type,
      text: item.text,
      owner: item.owner || null,
      deadline_raw: item.deadline?.raw || null,
      deadline_iso: item.deadline?.resolved_iso || null,
      status: "open",
      trust_score: item.trust_score,
      review_state: ambiguous ? "pending_review" : item.review_state,
      source_quote: item.source_quote,
      source_timestamp: item.source_timestamp || null,
      dependency_hints: item.dependency_hints || [],
      supersedes_hint: item.supersedes_hint || null,
    };

    // Primary insert carries the optional columns (enkrypt_checks, owner_id,
    // owner_email, review_reason). If any of those columns don't exist yet,
    // fall back to the guaranteed base payload so persistence never breaks —
    // the review_state override still routes ambiguous items to /review.
    let { data: dbItem, error: insertErr } = await supabase
      .from("items")
      .insert({ ...basePayload, enkrypt_checks: item.enkrypt_checks, owner_id, owner_email, review_reason: reviewReason })
      .select()
      .single();

    if (insertErr?.message?.includes("Could not find")) {
      ({ data: dbItem } = await supabase.from("items").insert(basePayload).select().single());
    }

    if (dbItem) {
      storedItems.push({
        id: dbItem.id,
        text: dbItem.text,
        type: dbItem.type,
        owner: dbItem.owner,
        trust_score: dbItem.trust_score,
        review_state: dbItem.review_state,
        supersedes_hint: dbItem.supersedes_hint,
        dependency_hints: dbItem.dependency_hints || [],
      });
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  // Enkrypt Checkpoint 2 hard gate: quarantined items are still written to
  // Supabase (so a human can triage them in /review — never silently
  // dropped), but they must NEVER enter Qdrant. Embedding them would let a
  // quarantined hallucination surface in search, ask-mode citations, or
  // dependency resolution before a human has cleared it.
  const embeddableItems = storedItems.filter((it) => it.review_state !== "quarantined");

  if (embeddableItems.length > 0) {
    const textsToEmbed = embeddableItems.map(
      (it) => `[${it.type}] ${it.text}${it.owner ? ` (owner: ${it.owner})` : ""}`
    );
    const { embeddings } = await withLLMTrace(
      { model: "gemini-embedding-001", endpoint: "/api/pipeline", label: "pipeline-embedding" },
      () => embedMany({ model: embeddingModel, values: textsToEmbed })
    );
    // Include project_id in payload so dependency resolution can filter by it
    const metadata = embeddableItems.map((it) => ({
      item_id: it.id,
      text: it.text,
      type: it.type,
      meeting_id: meeting.id,
      meeting_title,
      owner: it.owner || "unassigned",
      trust_score: it.trust_score,
      review_state: it.review_state,
      project_id: PROJECT_ID,
      supersedes_hint: it.supersedes_hint || "",
    }));
    await qdrant.upsert({ indexName: COLLECTION, vectors: embeddings, metadata });
  }

  return {
    meeting_id: meeting.id,
    stored_items: storedItems,
    items_auto: storedItems.filter((i) => i.review_state === "auto").length,
    items_review: storedItems.filter((i) => i.review_state === "pending_review").length,
    items_quarantined: storedItems.filter((i) => i.review_state === "quarantined").length,
  };
}

// ---------------------------------------------------------------------------
// Step 6: Chunk transcript and embed to transcript_chunks (P2-8)
// Creates the collection if it doesn't exist (3072 dims, cosine metric).
// Chunks by 45-second windows or max 6 lines, whichever comes first.
// ---------------------------------------------------------------------------
async function embedTranscriptChunks(input: {
  transcript: string;
  meeting_id: string;
  meeting_title: string;
}): Promise<{ chunks_stored: number }> {
  const { transcript, meeting_id, meeting_title } = input;
  const chunks = chunkTranscript(transcript);
  if (chunks.length === 0) return { chunks_stored: 0 };

  // Ensure collection exists (idempotent — catch "already exists" errors)
  try {
    await qdrant.createIndex({
      indexName: CHUNKS_COLLECTION,
      dimension: 3072,
      metric: "cosine",
    });
  } catch {
    // Collection already exists — fine
  }

  const { embeddings } = await withLLMTrace(
    { model: "gemini-embedding-001", endpoint: "/api/pipeline", label: "pipeline-chunk-embedding" },
    () => embedMany({ model: embeddingModel, values: chunks.map((c) => c.text) })
  );

  const metadata = chunks.map((chunk, i) => ({
    chunk_text: chunk.text,
    meeting_id,
    meeting_title,
    chunk_index: i,
    start_time: chunk.startTime,
    end_time: chunk.endTime,
    project_id: PROJECT_ID,
  }));

  await qdrant.upsert({
    indexName: CHUNKS_COLLECTION,
    vectors: embeddings,
    metadata,
  });

  return { chunks_stored: chunks.length };
}

// ---------------------------------------------------------------------------
// Step 7: Dependency resolution (P2-10)
// For each item with dependency_hints, embeds the hint phrase and searches
// Qdrant meeting_items filtered by project_id. Links items with similarity > 0.7.
// Uses raw Qdrant REST so we can pass the project_id payload filter.
// ---------------------------------------------------------------------------
async function resolveDependencies(input: {
  stored_items: StoredItem[];
  project_id: string;
}): Promise<{ dependencies_resolved: number; log: string[] }> {
  const { stored_items, project_id } = input;
  let dependencies_resolved = 0;
  const log: string[] = [];

  for (const item of stored_items) {
    if (!item.dependency_hints || item.dependency_hints.length === 0) continue;

    const resolvedIds: string[] = [];

    for (const hint of item.dependency_hints) {
      const { embedding } = await embed({ model: embeddingModel, value: hint });

      // Raw Qdrant REST search filtered by project_id — @mastra/qdrant has no filter API
      let matches: Array<{ score: number; payload: Record<string, any> }> = [];
      try {
        matches = await qdrantRawSearch(COLLECTION, embedding, 3, {
          must: [{ key: "project_id", match: { value: project_id } }],
        });
      } catch {
        // Collection may not have project_id indexed yet — fall back to unfiltered
        const raw = await qdrant.query({
          indexName: COLLECTION,
          queryVector: embedding,
          topK: 3,
        });
        matches = raw.map((r: any) => ({ score: r.score ?? 0, payload: r.metadata ?? {} }));
      }

      // Best match that is not the item itself
      const best = matches.find((m) => m.payload?.item_id !== item.id);

      if (best && best.score > 0.7) {
        resolvedIds.push(best.payload.item_id);
        log.push(
          `"${item.text.slice(0, 40)}…" → depends on "${String(best.payload.text || "").slice(0, 40)}…" (${best.score.toFixed(2)})`
        );
        dependencies_resolved++;
      }
    }

    if (resolvedIds.length > 0) {
      await supabase
        .from("items")
        .update({ depends_on: resolvedIds })
        .eq("id", item.id);
    }
  }

  return { dependencies_resolved, log };
}

// ---------------------------------------------------------------------------
// Step 8: Contradiction detection
// Similarity-based (score > 0.85) + explicit supersedes_hint resolution.
// ---------------------------------------------------------------------------
async function detectContradictions(input: {
  stored_items: StoredItem[];
  meeting_id: string;
}): Promise<{ contradictions_found: number }> {
  const { stored_items, meeting_id } = input;
  let contradictions_found = 0;
  const decisions = stored_items.filter((i) => i.type === "decision");

  for (const item of decisions) {
    // Similarity-based contradiction
    const { embedding } = await embed({ model: embeddingModel, value: item.text });
    const similar: any[] = await qdrant.query({
      indexName: COLLECTION,
      queryVector: embedding,
      topK: 5,
    });

    for (const match of similar) {
      const meta = match.metadata as any;
      if (
        meta?.meeting_id !== meeting_id &&
        (match.score ?? 0) > 0.85 &&
        meta?.text !== item.text
      ) {
        await supabase.from("contradictions").insert({
          item_a_id: meta.item_id,
          item_b_id: item.id,
          description: `"${item.text.slice(0, 80)}" may contradict "${String(meta.text).slice(0, 80)}" (similarity: ${Number(match.score ?? 0).toFixed(2)})`,
        });
        contradictions_found++;
        break;
      }
    }

    // Explicit supersedes_hint resolution
    if (item.supersedes_hint) {
      const { embedding: hintEmbed } = await embed({
        model: embeddingModel,
        value: item.supersedes_hint,
      });
      const supersededMatches: any[] = await qdrant.query({
        indexName: COLLECTION,
        queryVector: hintEmbed,
        topK: 3,
      });
      const superseded = supersededMatches.find(
        (m) =>
          (m.metadata as any)?.type === "decision" &&
          (m.metadata as any)?.meeting_id !== meeting_id
      );
      if (superseded) {
        const sm = superseded.metadata as any;
        await supabase.from("contradictions").insert({
          item_a_id: sm.item_id,
          item_b_id: item.id,
          description: `"${item.text.slice(0, 80)}" supersedes "${String(sm.text).slice(0, 80)}" — ${item.supersedes_hint}`,
        });
        contradictions_found++;
      }
    }
  }

  return { contradictions_found };
}

// ---------------------------------------------------------------------------
// Audio transcription via Groq Whisper (verbose_json for timestamps)
// ---------------------------------------------------------------------------
async function transcribeAudio(
  file: File,
  participantNames?: string[],
  speakerTimeline?: Array<{ atMs: number; name: string }>
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const form = new FormData();
  form.append("file", file);
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Groq transcription error ${res.status}: ${msg}`);
  }

  const data = await res.json();

  // Format segments as [MM:SS] text lines for downstream chunking. Whisper
  // gives no speaker identity. If the room captured a live Jitsi
  // dominantSpeakerChanged timeline, use that for a free, deterministic
  // lookup — otherwise fall back to asking Gemini to guess from the audio
  // (falls back further to unlabeled lines if that call fails too).
  if (data.segments && Array.isArray(data.segments) && data.segments.length > 0) {
    const segments = data.segments.map((seg: { start?: number; text?: string }) => ({
      start: seg.start ?? 0,
      text: String(seg.text ?? "").trim(),
    }));
    if (speakerTimeline && speakerTimeline.length > 0) {
      return applySpeakerTimeline(segments, speakerTimeline);
    }
    const audioBuffer = await file.arrayBuffer();
    return addSpeakerLabels(audioBuffer, file.type, segments, participantNames);
  }

  return data.text ?? "";
}

// ---------------------------------------------------------------------------
// Pipeline API route — accepts JSON { transcript, title } OR multipart audio
//
// Runs the 7-step pipeline as plain sequential code (extract -> score ->
// redact-pii -> persist -> embed-chunks -> resolve-deps -> contradictions)
// instead of an LLM-orchestrated multi-tool agent. The agentic version had
// one LLM call decide which of 7 tools to invoke next; on Featherless's
// open-weight models that dynamic tool-selection was unreliable (malformed
// tool-call arguments, or — worse — the model skipping tool execution
// entirely and fabricating a plausible-looking success summary, confirmed by
// zero rows written to Supabase despite a 200 response). The sequence here
// is fixed and known ahead of time, so there was never a real need for an
// LLM to "decide" the order — only the extraction step genuinely needs the
// LLM, for turning transcript text into structured items.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    // Rate limit: max 10 pipeline runs per minute per client (this is the most
    // expensive endpoint). Non-restructuring guard at the very top.
    const clientIp = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`pipeline:${clientIp}`, 10, 60_000)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 10 pipeline runs per minute." },
        { status: 429 }
      );
    }

    let transcript: string;
    let title: string;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // Audio file upload path
      const formData = await req.formData();
      const file = formData.get("file");
      title = String(formData.get("title") || "Untitled Meeting");

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
      }
      if (file.size > 25 * 1024 * 1024) {
        return NextResponse.json({ error: "File exceeds Groq's 25 MB limit" }, { status: 413 });
      }

      // Optional roster of display names seen in the Jitsi room, passed by
      // /rooms/[id] so diarization matches voices to real names instead of
      // guessing them from what's said in the audio.
      let participantNames: string[] | undefined;
      const participantsRaw = formData.get("participants");
      if (typeof participantsRaw === "string") {
        try {
          const parsed = JSON.parse(participantsRaw);
          if (Array.isArray(parsed)) participantNames = parsed.filter((n) => typeof n === "string");
        } catch {
          /* ignore malformed roster — diarization falls back to voice-only guessing */
        }
      }

      // Optional live Jitsi dominantSpeakerChanged timeline, timestamped on
      // the recording's own clock — lets diarization label segments by direct
      // lookup instead of a Gemini guess (and costs zero model calls).
      let speakerTimeline: Array<{ atMs: number; name: string }> | undefined;
      const timelineRaw = formData.get("speakerTimeline");
      if (typeof timelineRaw === "string") {
        try {
          const parsed = JSON.parse(timelineRaw);
          if (Array.isArray(parsed)) {
            speakerTimeline = parsed.filter(
              (e) => e && typeof e.atMs === "number" && typeof e.name === "string"
            );
          }
        } catch {
          /* ignore malformed timeline — diarization falls back to Gemini/voice guessing */
        }
      }

      transcript = await withLLMTrace(
        { model: "whisper-large-v3", endpoint: "/api/pipeline", label: "pipeline-transcription" },
        () => transcribeAudio(file, participantNames, speakerTimeline)
      );
    } else {
      // JSON text-paste path
      const body = await req.json();
      transcript = body.transcript;
      title = body.title;
    }

    if (!transcript || !title) {
      return NextResponse.json(
        { error: "transcript and title required" },
        { status: 400 }
      );
    }

    // XSS-sanitize + length-cap the transcript before it reaches any LLM.
    // Reassigns the same variable so every downstream call uses the sanitized
    // value without renaming (no control-flow change).
    transcript = sanitizeInput(transcript);

    // Enkrypt Checkpoint 1 — hard gate. Runs before the transcript is ever
    // passed to an LLM. A flagged transcript halts the pipeline here; nothing
    // downstream (extraction, storage, embedding) ever sees it.
    const injectionCheck = await runInjectionCheck(transcript);
    if (!injectionCheck.safe) {
      return NextResponse.json(
        {
          error: "Prompt injection detected in transcript. Pipeline halted for safety.",
          halted: true,
          confidence: injectionCheck.confidence,
        },
        { status: 400 }
      );
    }

    // 1. Extract
    const extraction = await runExtraction(transcript);

    // 2. Trust score (Enkrypt Checkpoints 2 + 3)
    const scoring = await scoreTrustItems({
      items: extraction.items,
      transcript,
      meeting_title: title,
    });

    // 3. Redact PII (Enkrypt Checkpoint 3)
    const piiResult = await piiRedact({ items: scoring.scored_items });

    // 4. Persist to Supabase + Qdrant
    const persisted = await persistPipeline({
      meeting_title: title,
      transcript,
      scored_items: piiResult.redacted_items,
    });

    // 5. Chunk + embed full transcript
    const chunked = await embedTranscriptChunks({
      transcript,
      meeting_id: persisted.meeting_id,
      meeting_title: title,
    });

    // 6. Resolve dependencies
    const deps = await resolveDependencies({
      stored_items: persisted.stored_items,
      project_id: PROJECT_ID,
    });

    // 7. Detect contradictions
    const contradictions = await detectContradictions({
      stored_items: persisted.stored_items,
      meeting_id: persisted.meeting_id,
    });

    return NextResponse.json({
      success: true,
      meeting_id: persisted.meeting_id,
      items_count: persisted.stored_items.length,
      items_auto: persisted.items_auto,
      items_review: persisted.items_review,
      items_quarantined: persisted.items_quarantined,
      pii_found: piiResult.pii_found,
      chunks_stored: chunked.chunks_stored,
      dependencies_resolved: deps.dependencies_resolved,
      contradictions_found: contradictions.contradictions_found,
      steps: [
        `Extracted ${extraction.items.length} items`,
        `Trust scored ${scoring.scored_items.length} items`,
        `PII scan: ${piiResult.pii_found} token(s) redacted`,
        `Stored ${persisted.stored_items.length} items to Supabase + Qdrant`,
        `Chunked transcript into ${chunked.chunks_stored} segments`,
        `Resolved ${deps.dependencies_resolved} dependencies`,
        `Contradiction check: ${contradictions.contradictions_found} conflict(s) found`,
      ],
    });
  } catch (error: any) {
    console.error("Pipeline error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
