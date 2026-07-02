import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("id, title, project_id")
      .eq("id", id)
      .single();

    if (meetingErr || !meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File too large — Groq limit is 25 MB" },
        { status: 413 }
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
    }

    // Transcribe via Groq Whisper
    const groqForm = new FormData();
    groqForm.append("file", file);
    groqForm.append("model", "whisper-large-v3");
    groqForm.append("response_format", "verbose_json");
    groqForm.append("timestamp_granularities[]", "segment");

    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    });

    if (!groqRes.ok) {
      const body = await groqRes.text().catch(() => "");
      return NextResponse.json(
        { error: `Groq transcription failed: ${body}` },
        { status: 502 }
      );
    }

    const result = await groqRes.json();
    let transcript = "";
    if (result.segments?.length) {
      transcript = result.segments
        .map((seg: any) => {
          const m = Math.floor((seg.start ?? 0) / 60);
          const s = Math.floor((seg.start ?? 0) % 60);
          return `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}] ${String(seg.text ?? "").trim()}`;
        })
        .join("\n");
    } else {
      transcript = result.text ?? "";
    }

    // Store transcript on the existing meeting
    await supabase
      .from("meetings")
      .update({ transcript_text: transcript })
      .eq("id", id);

    // Forward to pipeline for item extraction.
    // Pipeline creates its own meeting; we re-link and clean up the duplicate after.
    const pipelineForm = new FormData();
    pipelineForm.append("file", file, file.name);
    if (meeting.title) pipelineForm.append("meeting_title", meeting.title);
    if (meeting.project_id) pipelineForm.append("project_id", meeting.project_id);

    const origin = req.nextUrl.origin;
    const pipelineRes = await fetch(`${origin}/api/pipeline`, {
      method: "POST",
      body: pipelineForm,
    });
    const pipelineData = await pipelineRes.json().catch(() => ({}));

    // Re-link pipeline items to this meeting and remove the duplicate meeting
    if (pipelineData.meeting_id && pipelineData.meeting_id !== id) {
      await supabase
        .from("items")
        .update({ meeting_id: id })
        .eq("meeting_id", pipelineData.meeting_id);
      await supabase.from("meetings").delete().eq("id", pipelineData.meeting_id);
    }

    return NextResponse.json({
      meeting_id: id,
      transcript,
      items_extracted: pipelineData.items_stored || 0,
      pipeline: pipelineData,
    });
  } catch (error: any) {
    console.error("Recording upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
