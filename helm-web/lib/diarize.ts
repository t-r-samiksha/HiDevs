import { generateText } from "ai";
import { google } from "@ai-sdk/google";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// Ground-truth alternative to addSpeakerLabels below: when the caller has a
// live timeline of Jitsi's own dominantSpeakerChanged events (timestamped on
// the same clock as the recording), each Whisper segment can be labeled by a
// direct lookup instead of asking an LLM to guess from the audio. No model
// call at all — free, instant, and more accurate since it reflects who the
// conference itself detected as speaking, not a voice-similarity guess.
export function applySpeakerTimeline(
  segments: Array<{ start: number; text: string }>,
  timeline: Array<{ atMs: number; name: string }>
): string {
  const sorted = [...timeline].sort((a, b) => a.atMs - b.atMs);

  function speakerAt(startSec: number): string {
    const atMs = startSec * 1000;
    let current = "Unknown speaker";
    for (const entry of sorted) {
      if (entry.atMs > atMs) break;
      current = entry.name;
    }
    return current;
  }

  return segments
    .map((s) => `[${formatTime(s.start)}] ${speakerAt(s.start)}: ${s.text}`)
    .join("\n");
}

// Whisper (Groq) has no concept of "who" is speaking — only "what" and "when".
// This asks Gemini to listen to the same audio and assign a speaker label per
// segment, using a real name if one is said aloud (e.g. "Hello, Joanne") and
// falling back to "Speaker N" otherwise. The original Whisper text is never
// altered — only a label is prefixed — so source_quote / PII / Enkrypt
// adherence matching downstream still lines up exactly with the transcript.
export async function addSpeakerLabels(
  audioBuffer: ArrayBuffer,
  mimeType: string,
  segments: Array<{ start: number; text: string }>,
  knownParticipants?: string[]
): Promise<string> {
  const fallback = () =>
    segments.map((s) => `[${formatTime(s.start)}] ${s.text}`).join("\n");

  if (segments.length === 0) return "";

  const numbered = segments
    .map((s, i) => `${i}. (${formatTime(s.start)}) "${s.text}"`)
    .join("\n");

  // When we know who actually joined the call (e.g. Jitsi room roster), give
  // Gemini a closed candidate list to match voices against instead of having
  // it guess names purely from what's said in the audio — far more reliable.
  const rosterLine =
    knownParticipants && knownParticipants.length > 0
      ? `\nThe people known to have joined this call are: ${knownParticipants.join(", ")}. Match each line's voice to one of these names whenever possible. Only use "Speaker N" for a voice that clearly belongs to none of them (e.g. an unannounced extra participant).\n`
      : "";

  const prompt = `You will hear an audio recording of a meeting. Below is a numbered, timestamped transcript of what was said (already transcribed by another tool — the wording is final and must not be changed).

For EACH numbered line, listen to the audio at that timestamp and identify the speaker by distinguishing voices.${rosterLine ? "" : ' Use the person\'s real name if it is said aloud in the recording (e.g. someone greets them by name, or they introduce themselves); otherwise label them "Speaker 1", "Speaker 2", etc., keeping the same label for the same voice throughout the recording.'}
${rosterLine}
Return ONLY a JSON array of exactly ${segments.length} strings (speaker labels only, no other text), in line order. Example: ["Speaker 1","Ramesh","Speaker 1"]

${numbered}`;

  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      // Diarization is a nice-to-have fallback, not core pipeline output —
      // don't burn ~20s retrying against a 429. Most quota exhaustion here is
      // a per-day cap (not per-minute), so retrying within seconds can't
      // succeed anyway; fail fast into the unlabeled-transcript fallback below.
      maxRetries: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "file", data: Buffer.from(audioBuffer), mediaType: mimeType },
          ],
        },
      ],
    });

    const cleaned = text.replace(/```json|```/g, "").trim();
    const labels: unknown = JSON.parse(cleaned);
    if (!Array.isArray(labels) || labels.length !== segments.length) {
      throw new Error("Speaker label count mismatch");
    }

    return segments
      .map((s, i) => `[${formatTime(s.start)}] ${String(labels[i]).trim()}: ${s.text}`)
      .join("\n");
  } catch (err) {
    console.error("Speaker labeling failed, falling back to unlabeled transcript:", err);
    return fallback();
  }
}
