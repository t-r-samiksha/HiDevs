import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Agent } from "@mastra/core/agent";
import { QdrantVector } from "@mastra/qdrant";
import { google } from "@ai-sdk/google";
import { embedMany } from "ai";

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
const PROJECT_ID = "a1b2c3d4-0000-0000-0000-000000000001";
const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");

// ---------------------------------------------------------------------------
// Extraction agent
// ---------------------------------------------------------------------------
const extractionAgent = new Agent({
  id: "extraction-agent",
  name: "Extraction Agent",
  model: "google/gemini-2.5-flash",
  instructions: `
You read a meeting transcript and extract every DECISION and ACTION ITEM —
including ones that are uncertain, secondhand, or hedged ("I think someone
agreed…", "I might be misremembering…", "as I understood it…").
Do NOT skip a line just because the speaker is unsure; extract the potential
commitment and let downstream review decide its validity.
Do NOT invent people, numbers, or facts that are completely absent from the
transcript, but DO extract commitments that are implied or reported.

FOR EACH ITEM, PRODUCE:
- type: "decision" or "action_item"
- text: one self-contained sentence stating the commitment as a fact
- owner: person responsible, as named. OMIT if none stated.
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
// Enkrypt helpers
// ---------------------------------------------------------------------------
async function enkryptPost(path: string, body: unknown) {
  const res = await fetch(ENKRYPT_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ENKRYPT_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Enkrypt ${path} → ${res.status}`);
  return res.json();
}

async function checkInjection(text: string) {
  const r = await enkryptPost("/guardrails/detect", {
    text,
    detectors: { injection_attack: { enabled: true } },
  });
  return {
    flagged: r.summary?.injection_attack === 1,
    confidence: parseFloat(r.details?.injection_attack?.attack) || 0,
  };
}

async function checkAdherence(context: string, llmAnswer: string) {
  const r = await enkryptPost("/guardrails/adherence", {
    context,
    llm_answer: llmAnswer,
  });
  return r.summary.adherence_score === 1.0;
}

// Build the narrow context Enkrypt checks each item against.
// Using only the source_quote (not the whole transcript) means the check
// detects when the extracted text adds specifics the cited quote never said.
// We prepend the speaker label from the transcript line so that speaker-name
// substitutions ("I'll have" → "Ananya will have") don't false-positive fail.
function buildAdherenceContext(transcript: string, sourceQuote: string): string {
  if (!sourceQuote) return transcript;
  // Find the transcript line(s) containing the source quote and return them
  // with their [MM:SS] Speaker: prefix so the owner name is in scope.
  const lines = transcript.split("\n");
  for (const line of lines) {
    if (line.includes(sourceQuote.trim().slice(0, 40))) {
      return line.trim();
    }
  }
  // Fallback: return the quote as-is (still much narrower than full transcript)
  return sourceQuote;
}

async function checkRelevancy(question: string, llmAnswer: string) {
  const r = await enkryptPost("/guardrails/relevancy", {
    question,
    llm_answer: llmAnswer,
  });
  return r.summary.relevancy_score === 1.0;
}

function computeTrustScore(adherent: boolean, relevant: boolean) {
  if (!adherent) return 0.0;
  return relevant ? 0.9 : 0.7;
}

function reviewState(score: number) {
  if (score >= 0.85) return "auto";
  if (score >= 0.6) return "pending_review";
  return "quarantined";
}

// ---------------------------------------------------------------------------
// Pipeline API route
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const { transcript, title } = await req.json();

    if (!transcript || !title) {
      return NextResponse.json({ error: "transcript and title required" }, { status: 400 });
    }

    const steps: string[] = [];

    // Step 1: Injection check
    const injection = await checkInjection(transcript);
    if (injection.flagged) {
      return NextResponse.json({
        error: "Injection detected in transcript",
        confidence: injection.confidence,
      }, { status: 422 });
    }
    steps.push("Injection check passed");

    // Step 2: Create meeting
    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .insert({
        title,
        source_type: "upload",
        transcript_text: transcript,
        project_id: PROJECT_ID,
      })
      .select()
      .single();

    if (meetingErr) throw new Error(meetingErr.message);
    steps.push(`Meeting created: ${meeting.id}`);

    // Step 3: Extract — retry up to 4× on Gemini demand spikes
    let agentResponse: Awaited<ReturnType<typeof extractionAgent.generate>>;
    const RETRY_DELAYS = [5_000, 15_000, 30_000];
    for (let attempt = 0; ; attempt++) {
      try {
        agentResponse = await extractionAgent.generate([
          { role: "user", content: transcript },
        ]);
        break;
      } catch (err: any) {
        const isThrottle =
          err?.message?.includes("high demand") ||
          err?.message?.includes("429") ||
          err?.status === 429;
        if (!isThrottle || attempt >= RETRY_DELAYS.length) throw err;
        steps.push(`Gemini busy — retrying in ${RETRY_DELAYS[attempt] / 1000}s (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }
    const response = agentResponse!;

    let extracted;
    try {
      const cleaned = response.text.replace(/```json|```/g, "").trim();
      extracted = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse extraction output");
    }

    const items = extracted.items || [];
    steps.push(`Extracted ${items.length} items`);

    // Step 4: Trust score + store each item
    const relevancyQ = `What decisions and action items were discussed in "${title}"?`;
    const storedItems = [];

    for (const item of items) {
      const adherenceCtx = buildAdherenceContext(transcript, item.source_quote || "");
      const adherent = await checkAdherence(adherenceCtx, item.text);
      const relevant = await checkRelevancy(relevancyQ, item.text);
      const score = computeTrustScore(adherent, relevant);
      const state = reviewState(score);

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

      if (!itemErr && dbItem) storedItems.push(dbItem);
      await new Promise((r) => setTimeout(r, 800));
    }
    steps.push(`Stored ${storedItems.length} items with trust scores`);

    // Step 5: Embed to Qdrant
    if (storedItems.length > 0) {
      const textsToEmbed = storedItems.map(
        (it: any) => `[${it.type}] ${it.text}${it.owner ? ` (owner: ${it.owner})` : ""}`
      );

      const { embeddings } = await embedMany({
        model: embeddingModel,
        values: textsToEmbed,
      });

      const metadata = storedItems.map((it: any) => ({
        item_id: it.id,
        text: it.text,
        type: it.type,
        meeting_id: meeting.id,
        meeting_title: title,
        owner: it.owner || "unassigned",
        status: it.status,
        trust_score: it.trust_score,
        source_quote: it.source_quote || "",
        supersedes_hint: it.supersedes_hint || "",
      }));

      await qdrant.upsert({
        indexName: COLLECTION,
        vectors: embeddings,
        metadata,
      });
      steps.push(`Embedded ${storedItems.length} vectors to Qdrant`);
    }

    return NextResponse.json({
      success: true,
      meeting_id: meeting.id,
      items_count: storedItems.length,
      steps,
    });
  } catch (error: any) {
    console.error("Pipeline error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
