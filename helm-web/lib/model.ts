/**
 * Central Gemini generation model (single source of truth, env-overridable).
 *
 * Default is gemini-2.5-flash: on this project's free tier it's the only model
 * with any quota (~20 requests/day) — gemini-2.0-flash returns limit:0 here.
 * If you attach a key/project that grants a higher-quota model, set GEMINI_MODEL
 * (e.g. GEMINI_MODEL=gemini-2.0-flash) with no code change.
 *
 * Embeddings are separate (gemini-embedding-001) and unaffected.
 */
export const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/** Model id in the form Mastra's Agent expects (`provider/model`). */
export const MASTRA_GEMINI_MODEL = `google/${GEMINI_MODEL_NAME}` as `google/${string}`;
