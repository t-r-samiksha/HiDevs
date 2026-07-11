import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GENERATION_MODEL_NAME } from "@/lib/model";
import { securityHeaders } from "@/lib/security";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/settings/health — live status of every external dependency.
export async function GET() {
  const COLLECTION = process.env.QDRANT_COLLECTION || "meeting_items";

  // Supabase — a trivial query proves the connection + credentials.
  let supabaseOk = false;
  let supabaseDetail = "";
  try {
    const { error } = await supabase.from("projects").select("id").limit(1);
    supabaseOk = !error;
    supabaseDetail = error ? error.message : "connected";
  } catch (e) {
    supabaseDetail = e instanceof Error ? e.message : "unreachable";
  }

  // Qdrant — fetch collection info.
  let qdrantOk = false;
  let qdrantDetail = "";
  try {
    const res = await fetch(`${process.env.QDRANT_URL}/collections/${COLLECTION}`, {
      headers: { "api-key": process.env.QDRANT_API_KEY || "" },
    });
    qdrantOk = res.ok;
    qdrantDetail = res.ok ? `collection "${COLLECTION}" reachable` : `HTTP ${res.status}`;
  } catch (e) {
    qdrantDetail = e instanceof Error ? e.message : "unreachable";
  }

  const has = (k: string) => Boolean(process.env[k] && process.env[k]!.trim().length > 0);

  return NextResponse.json(
    {
      checked_at: new Date().toISOString(),
      services: {
        supabase: { ok: supabaseOk, detail: supabaseDetail },
        qdrant: { ok: qdrantOk, detail: qdrantDetail, collection: COLLECTION },
        enkrypt: { ok: has("ENKRYPT_API_KEY"), detail: has("ENKRYPT_API_KEY") ? "API key configured" : "ENKRYPT_API_KEY missing" },
        featherless: {
          ok: has("FEATHERLESS_API_KEY"),
          detail: has("FEATHERLESS_API_KEY") ? "API key configured (text generation)" : "FEATHERLESS_API_KEY missing",
          model: GENERATION_MODEL_NAME,
        },
        gemini: {
          ok: has("GOOGLE_GENERATIVE_AI_API_KEY"),
          detail: has("GOOGLE_GENERATIVE_AI_API_KEY")
            ? "API key configured (embeddings + audio diarization only)"
            : "GOOGLE_GENERATIVE_AI_API_KEY missing",
          model: "gemini-embedding-001",
        },
        groq: { ok: has("GROQ_API_KEY"), detail: has("GROQ_API_KEY") ? "API key configured" : "GROQ_API_KEY missing (transcription disabled)" },
        slack: { ok: has("SLACK_WEBHOOK_URL"), detail: has("SLACK_WEBHOOK_URL") ? "webhook configured" : "SLACK_WEBHOOK_URL not set (notifications off)" },
      },
    },
    { headers: securityHeaders() }
  );
}
