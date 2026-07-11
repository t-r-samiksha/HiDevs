import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Central text-generation model (single source of truth, env-overridable).
 *
 * Provider is Featherless.ai (OpenAI-compatible), not Gemini. Gemini's free
 * tier is unworkable for this pipeline: gemini-2.5-flash/2.5-flash-lite
 * return 404 "no longer available to new users" on newly-created API keys,
 * gemini-2.0-flash/2.0-flash-lite return 429 with limit:0 (zero free quota),
 * and the one model that does work (gemini-flash-latest) caps at 20 free
 * requests/day — easily exhausted by a single pipeline run, which makes
 * several LLM calls (supervisor -> extraction -> dependency resolution ->
 * contradiction check).
 *
 * Featherless model must support native tool-calling since the supervisor
 * agent invokes tools (runExtractionTool etc.) via function-calling, not
 * prompted JSON. Qwen/Qwen3-32B and moonshotai/Kimi-K2-Instruct are the
 * models Featherless documents as having reliable native tool-calling.
 *
 * Embeddings stay on Gemini (gemini-embedding-001, 3072-dim) — separate
 * quota bucket, not affected by the above, and required to match the
 * existing Qdrant collection's vector dimension.
 */
export const GENERATION_MODEL_NAME =
  process.env.FEATHERLESS_MODEL || "Qwen/Qwen3-32B";

const featherless = createOpenAICompatible({
  name: "featherless",
  baseURL: "https://api.featherless.ai/v1",
  apiKey: process.env.FEATHERLESS_API_KEY,
  // Qwen3's default "thinking" mode spends the completion-token budget on a
  // chain-of-thought preamble before it gets to the actual tool call, which
  // truncates the tool-call arguments mid-generation and fails schema
  // validation. This is a Featherless-specific request field, not a
  // standard OpenAI one: https://featherless.ai/docs/chat-template-kwargs
  transformRequestBody: (body) => ({
    ...body,
    chat_template_kwargs: { enable_thinking: false },
  }),
});

/**
 * Ready-to-use ai-sdk LanguageModel instance. Mastra's Agent `model` field
 * accepts a real LanguageModel instance directly (in addition to its own
 * string/config shapes), so this same export covers both Mastra Agent
 * construction and direct generateText/generateObject calls.
 */
export const generationModel = featherless(GENERATION_MODEL_NAME);

/** Alias for Mastra Agent `model:` fields — same instance as generationModel. */
export const MASTRA_GENERATION_MODEL = generationModel;

/** @deprecated kept for any stray imports — same value as GENERATION_MODEL_NAME */
export const GEMINI_MODEL_NAME = GENERATION_MODEL_NAME;
/** @deprecated kept for any stray imports — same value as MASTRA_GENERATION_MODEL */
export const MASTRA_GEMINI_MODEL = MASTRA_GENERATION_MODEL;

/**
 * Real Gemini model name — for the few call sites that need actual Gemini
 * capabilities Featherless doesn't have (e.g. audio-file understanding for
 * speaker diarization in lib/diarize.ts). Do NOT use this for plain text
 * generation; use generationModel / MASTRA_GENERATION_MODEL instead.
 */
export const GEMINI_ONLY_MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";
