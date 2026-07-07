import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractionAgent } from "@/lib/mastra/agents/extraction-agent";
import { ExtractionResultSchema } from "@/lib/mastra/schemas/item.schema";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_PROJECT = "a1b2c3d4-0000-0000-0000-000000000001";

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
            transcript = result.segments
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((s: any) => {
                const m = Math.floor((s.start ?? 0) / 60);
                const sec = Math.floor((s.start ?? 0) % 60);
                return `[${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}] ${String(s.text ?? "").trim()}`;
              })
              .join("\n");
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

    // ── 3. Lightweight extraction — a SINGLE Gemini call, then direct insert ──
    // The full supervisor pipeline makes ~8 Gemini calls per run; on the 20/day
    // free tier that exhausts after ~2 meetings. This path uses one extraction
    // call so recordings keep producing items within quota. On a 429 it fails
    // fast and the meeting + transcript are already saved above.
    let items_extracted = 0;
    if (transcript.trim()) {
      try {
        const response = await extractionAgent.generate([{ role: "user", content: transcript }]);
        const cleaned = response.text.replace(/```json|```/g, "").trim();
        const parsed = ExtractionResultSchema.safeParse(JSON.parse(cleaned));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items: any[] = parsed.success ? parsed.data.items : JSON.parse(cleaned).items || [];

        const rows = items
          .filter((it) => it?.text)
          .slice(0, 50)
          .map((it) => ({
            meeting_id: meeting.id,
            project_id,
            type: it.type === "decision" ? "decision" : "action_item",
            text: String(it.text).slice(0, 2000),
            owner: it.owner || null,
            deadline_raw: it.deadline?.raw || null,
            deadline_iso: it.deadline?.resolved_iso || null,
            status: "open",
            // Lightweight path isn't Enkrypt-scored — mark for review, not auto-trusted.
            trust_score: 0.75,
            review_state: "pending_review",
            source_quote: it.source_quote || null,
            source_timestamp: it.source_timestamp || null,
            dependency_hints: Array.isArray(it.dependency_hints) ? it.dependency_hints : [],
            supersedes_hint: it.supersedes_hint || null,
          }));

        if (rows.length) {
          const { count, error: insErr } = await supabase.from("items").insert(rows, { count: "exact" });
          if (insErr) throw new Error(insErr.message);
          items_extracted = count ?? rows.length;
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
