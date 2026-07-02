import { NextRequest, NextResponse } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const ALLOWED_TYPES = new Set(["audio/mpeg", "audio/wav", "audio/mp4", "audio/webm", "audio/x-m4a"]);
const MAX_BYTES = 25 * 1024 * 1024; // Groq hard limit

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY is not configured" }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not parse form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No audio file in request" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Groq limit is 25 MB.` },
      { status: 413 }
    );
  }

  // Build FormData to forward to Groq — verbose_json gives segment timestamps
  const groqForm = new FormData();
  groqForm.append("file", file);
  groqForm.append("model", "whisper-large-v3");
  groqForm.append("response_format", "verbose_json");
  groqForm.append("timestamp_granularities[]", "segment");

  let groqRes: Response;
  try {
    groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    });
  } catch (err: any) {
    return NextResponse.json({ error: `Groq unreachable: ${err.message}` }, { status: 502 });
  }

  if (!groqRes.ok) {
    const body = await groqRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Groq error ${groqRes.status}: ${body}` },
      { status: groqRes.status }
    );
  }

  const result = await groqRes.json();

  // Format as [MM:SS] text lines so the pipeline can chunk by timestamp
  let transcript: string;
  if (result.segments && Array.isArray(result.segments) && result.segments.length > 0) {
    transcript = result.segments
      .map((seg: any) => {
        const mins = Math.floor((seg.start ?? 0) / 60);
        const secs = Math.floor((seg.start ?? 0) % 60);
        return `[${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}] ${String(seg.text ?? "").trim()}`;
      })
      .join("\n");
  } else {
    transcript = result.text ?? "";
  }

  return NextResponse.json({ transcript });
}
