/**
 * Central Gemini generation model (single source of truth, env-overridable).
 *
 * Default is gemini-flash-latest: as of 2026-07, gemini-2.5-flash and
 * gemini-2.5-flash-lite return 404 "no longer available to new users" on
 * newly-created API keys, and gemini-2.0-flash/2.0-flash-lite return 429
 * with limit:0 (zero free quota). gemini-flash-latest and
 * gemini-flash-lite-latest are the rolling aliases that currently work on
 * the free tier. Override with GEMINI_MODEL if that changes again.
 *
 * Embeddings are separate (gemini-embedding-001) and unaffected.
 */
export const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";

/** Model id in the form Mastra's Agent expects (`provider/model`). */
export const MASTRA_GEMINI_MODEL = `google/${GEMINI_MODEL_NAME}` as `google/${string}`;
