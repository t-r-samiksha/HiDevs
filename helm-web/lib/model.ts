import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { google } from "@ai-sdk/google";

/**
 * Text generation runs on Featherless.ai (OpenAI-compatible), not Gemini.
 * Gemini's free tier is unworkable here: gemini-2.5-flash/2.5-flash-lite
 * return 404 "no longer available to new users" on newly-created API keys,
 * gemini-2.0-flash/2.0-flash-lite return 429 with limit:0 (zero free quota),
 * and the one model that does work (gemini-flash-latest) caps at 20 free
 * requests/day.
 *
 * The pipeline (app/api/pipeline/route.ts) used to run an LLM-orchestrated
 * supervisor agent that dynamically chose which of 7 tools to call next via
 * function-calling. That was unreliable on Featherless's open-weight models
 * (Qwen3-32B emitted malformed tool-call arguments; with a workaround
 * applied it skipped tool execution entirely and fabricated a plausible
 * success summary — confirmed by zero rows written to Supabase despite a
 * 200 response). The pipeline is now plain sequential code instead, so it
 * no longer needs multi-tool function-calling reliability from the model at
 * all — only the extraction step still calls an LLM, for turning transcript
 * text into structured items via a single prompted JSON response, which
 * Featherless handles fine.
 *
 * Embeddings (gemini-embedding-001) stay on Gemini everywhere — separate
 * quota bucket, required to match the existing Qdrant collection's vector
 * dimension, unaffected by any of the above.
 */
export const GENERATION_MODEL_NAME =
  process.env.FEATHERLESS_MODEL || "Qwen/Qwen3-32B";

const featherless = createOpenAICompatible({
  name: "featherless",
  baseURL: "https://api.featherless.ai/v1",
  apiKey: process.env.FEATHERLESS_API_KEY,
});

/**
 * Ready-to-use ai-sdk LanguageModel instance. Mastra's Agent `model` field
 * accepts a real LanguageModel instance directly (in addition to its own
 * string/config shapes), so this same export covers both Mastra Agent
 * construction and direct generateText/generateObject calls.
 */
export const generationModel = featherless(GENERATION_MODEL_NAME);

/**
 * Real Gemini model name/instance — for the one call site that needs actual
 * Gemini capability Featherless doesn't have: audio-file understanding for
 * speaker diarization in lib/diarize.ts. Do NOT use for plain text
 * generation; use generationModel instead.
 */
export const GEMINI_ONLY_MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";
export const geminiModel = google(GEMINI_ONLY_MODEL_NAME);
