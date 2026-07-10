import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { QdrantVector } from "@mastra/qdrant";
import { google } from "@ai-sdk/google";
import { embedMany } from "ai";
import { extractionAgent } from "@/lib/mastra/agents/extraction-agent";
import { ExtractionResultSchema } from "@/lib/mastra/schemas/item.schema";
import { applySpeakerTimeline } from "@/lib/diarize";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_PROJECT = "a1b2c3d4-0000-0000-0000-000000000001";

const qdrant = new QdrantVector({
  id: "helm-record",
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
  https: true,
});
const embeddingModel = google.textEmbeddingModel("gemini-embedding-001");
const COLLECTION = process.env.QDRANT_COLLECTION || "meeting_items";
const ENKRYPT_KEY = process.env.ENKRYPT_API_KEY!;
const ENKRYPT_BASE = "https://api.enkryptai.com";

async function enkryptPost(path: string, body: unknown) {
  const res = await fetch(ENKRYPT_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ENKRYPT_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Enkrypt ${path} → ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

// Enkrypt Checkpoint 2 — adherence + relevancy → trust tiers (mirrors the
// pipeline). Falls back to a neutral pending_review score if Enkrypt is
// unreachable, so scoring never blocks the meeting save.
async function trustScore(
  text: string,
  sourceQuote: string,
  title: string
): Promise<{ trust_score: number; review_state: string }> {
  try {
    const [adherenceR, relevancyR] = await Promise.all([
      enkryptPost("/guardrails/adherence", { context: sourceQuote || "", llm_answer: text || "" }),
      enkryptPost("/guardrails/relevancy", {
        question: `What decisions and action items were discussed in "${title}"?`,
        llm_answer: text || "",
      }),
    ]);
    const adherent = (parseFloat(adherenceR.summary?.adherence_score) || 0) === 1.0;
    const relevant = (parseFloat(relevancyR.summary?.relevancy_score) || 0) === 1.0;
    const hasFinancialClaim = /\$\d/.test(text || "");
    const trust_score = !adherent ? 0.0 : relevant ? 0.9 : hasFinancialClaim ? 0.4 : 0.7;
    const review_state = trust_score >= 0.85 ? "auto" : trust_score >= 0.6 ? "pending_review" : "quarantined";
    return { trust_score, review_state };
  } catch (e) {
    console.error("Enkrypt trust scoring failed for a recorded item:", e);
    return { trust_score: 0.75, review_state: "pending_review" };
  }
}

/**
 * POST /api/meetings/record — the reliable live-recording save path.
 * multipart: { file (audio), title?, project_id? }.
 *
 * Order matters: we transcribe, then ALWAYS create the meeting row with the
 * transcript (deterministic — this is what was previously buried inside the
 * agent pipeline and could silently no-op). Item extraction runs afterwards as
 * best-effort and never blocks the save.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const title = String(form.get("title") || "Live meeting");
    const project_id = String(form.get("project_id") || DEFAULT_PROJECT);

    // Optional live Jitsi dominantSpeakerChanged timeline → deterministic speaker
    // labels with NO LLM/quota (vs Gemini diarization, which 429s on free tier).
    let speakerTimeline: Array<{ atMs: number; name: string }> | undefined;
    const timelineRaw = form.get("speakerTimeline");
    if (typeof timelineRaw === "string") {
      try {
        const parsed = JSON.parse(timelineRaw);
        if (Array.isArray(parsed)) {
          speakerTimeline = parsed.filter(
            (e) => e && typeof e.atMs === "number" && typeof e.name === "string"
          );
        }
      } catch {
        /* ignore malformed timeline — falls back to [MM:SS] text */
      }
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Recording exceeds Groq's 25 MB limit" }, { status: 413 });
    }

    // ── 1. Transcribe (best-effort — a failure still saves an empty-transcript meeting) ──
    let transcript = "";
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      try {
        const groqForm = new FormData();
        groqForm.append("file", file, file.name || "meeting.webm");
        groqForm.append("model", "whisper-large-v3");
        groqForm.append("response_format", "verbose_json");
        groqForm.append("timestamp_granularities[]", "segment");
        const groqRes = await fetch(GROQ_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: groqForm,
        });
        if (groqRes.ok) {
          const result = await groqRes.json();
          if (Array.isArray(result.segments) && result.segments.length) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const segs = result.segments.map((s: any) => ({
              start: s.start ?? 0,
              text: String(s.text ?? "").trim(),
            }));
            if (speakerTimeline && speakerTimeline.length > 0) {
              // "[MM:SS] Name: text" via Jitsi's own speaker detection (no LLM).
              transcript = applySpeakerTimeline(segs, speakerTimeline);
            } else {
              transcript = segs
                .map((s: { start: number; text: string }) => {
                  const m = Math.floor(s.start / 60);
                  const sec = Math.floor(s.start % 60);
                  return `[${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}] ${s.text}`;
                })
                .join("\n");
            }
          } else {
            transcript = result.text ?? "";
          }
        } else {
          console.error("Groq transcription failed:", groqRes.status, await groqRes.text().catch(() => ""));
        }
      } catch (e) {
        console.error("Groq transcription error:", e);
      }
    } else {
      console.error("GROQ_API_KEY not configured — saving meeting without transcript.");
    }

    // ── 2. ALWAYS create the meeting with whatever transcript we have ──────────
    const { data: meeting, error: meetErr } = await supabase
      .from("meetings")
      .insert({
        project_id,
        title,
        source_type: "live",
        date: new Date().toISOString(),
        transcript_text: transcript,
      })
      .select("id")
      .single();
    if (meetErr) throw new Error(`Failed to save meeting: ${meetErr.message}`);

    // ── 3. Extraction (1 Gemini call) → Enkrypt trust-scoring → store → embed ─
    // Uses a single generate call (quota-friendly vs the ~8-call supervisor),
    // but recorded items get the SAME depth as uploaded ones: real Enkrypt
    // adherence/relevancy trust scores and Qdrant embeddings (both use quotas
    // separate from the 20/day generate limit). Every sub-step is best-effort —
    // the meeting + transcript are already persisted above.
    let items_extracted = 0;
    if (transcript.trim()) {
      try {
        const response = await extractionAgent.generate([{ role: "user", content: transcript }]);
        const cleaned = response.text.replace(/```json|```/g, "").trim();
        const parsed = ExtractionResultSchema.safeParse(JSON.parse(cleaned));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items: any[] = parsed.success ? parsed.data.items : JSON.parse(cleaned).items || [];

        // Enkrypt Checkpoint 2 per item (sequential to respect Enkrypt rate limits).
        const rows: Record<string, unknown>[] = [];
        for (const it of items.filter((i) => i?.text).slice(0, 50)) {
          const { trust_score, review_state } = await trustScore(
            String(it.text),
            it.source_quote || "",
            title
          );
          rows.push({
            meeting_id: meeting.id,
            project_id,
            type: it.type === "decision" ? "decision" : "action_item",
            text: String(it.text).slice(0, 2000),
            owner: it.owner || null,
            deadline_raw: it.deadline?.raw || null,
            deadline_iso: it.deadline?.resolved_iso || null,
            status: "open",
            trust_score,
            review_state,
            source_quote: it.source_quote || null,
            source_timestamp: it.source_timestamp || null,
            dependency_hints: Array.isArray(it.dependency_hints) ? it.dependency_hints : [],
            supersedes_hint: it.supersedes_hint || null,
          });
        }

        if (rows.length) {
          const { data: inserted, error: insErr } = await supabase
            .from("items")
            .insert(rows)
            .select("id, text, type, owner, trust_score, review_state, supersedes_hint");
          if (insErr) throw new Error(insErr.message);
          items_extracted = inserted?.length ?? 0;

          // Embed non-quarantined items into Qdrant meeting_items so recorded
          // meetings are searchable / RAG-able like uploaded ones. Best-effort.
          const embeddable = (inserted || []).filter((r) => r.review_state !== "quarantined");
          if (embeddable.length) {
            try {
              const texts = embeddable.map(
                (r) => `[${r.type}] ${r.text}${r.owner ? ` (owner: ${r.owner})` : ""}`
              );
              const { embeddings } = await embedMany({ model: embeddingModel, values: texts });
              const metadata = embeddable.map((r) => ({
                item_id: r.id,
                text: r.text,
                type: r.type,
                meeting_id: meeting.id,
                meeting_title: title,
                owner: r.owner || "unassigned",
                trust_score: r.trust_score,
                review_state: r.review_state,
                project_id,
                supersedes_hint: r.supersedes_hint || "",
              }));
              await qdrant.upsert({ indexName: COLLECTION, vectors: embeddings, metadata });
            } catch (e) {
              console.error("Qdrant embedding failed (items still saved):", e);
            }
          }
        }
      } catch (e) {
        console.error("Extraction failed (meeting + transcript still saved):", e);
      }
    }

    return NextResponse.json({
      meeting_id: meeting.id,
      transcript_length: transcript.length,
      items_extracted,
      saved: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Meeting record save error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
