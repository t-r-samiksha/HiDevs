// OpenTelemetry-compatible in-process LLM call tracing.
// Logs every wrapped LLM call with: model, latency, token usage, prompt hash,
// status. In-memory ring buffer (last 1000) for the hackathon; a real
// deployment would export these to an OTel collector / Mastra Cloud.
import { randomUUID, createHash } from "crypto";

export interface LLMTrace {
  id: string;
  timestamp: string;
  model: string;
  prompt_hash: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  status: "success" | "error" | "rate_limited";
  endpoint: string;
  error_message?: string;
}

const traces: LLMTrace[] = [];

export function traceLLMCall(trace: Omit<LLMTrace, "id" | "timestamp">) {
  traces.push({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...trace,
  });
  // Keep last 1000 traces in memory.
  if (traces.length > 1000) traces.splice(0, traces.length - 1000);
}

export function getTraces(limit = 100): LLMTrace[] {
  return traces.slice(-limit);
}

export function getTraceStats() {
  const recent = traces.slice(-100);
  const n = recent.length || 1;
  return {
    total_calls: recent.length,
    avg_latency_ms: Math.round(recent.reduce((s, t) => s + t.latency_ms, 0) / n),
    error_rate: recent.filter((t) => t.status === "error").length / n,
    rate_limit_hits: recent.filter((t) => t.status === "rate_limited").length,
    models_used: [...new Set(recent.map((t) => t.model))],
    total_input_tokens: recent.reduce((s, t) => s + t.input_tokens, 0),
    total_output_tokens: recent.reduce((s, t) => s + t.output_tokens, 0),
  };
}

/** Stable, privacy-preserving hash of a prompt (never store raw prompts). */
export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

/**
 * Wrap an async LLM call: times it, hashes the prompt, records token usage from
 * the AI SDK result (`.usage`), and logs a trace. Never throws on trace failure;
 * rethrows the original error (tagged rate_limited on 429).
 */
export async function withLLMTrace<T>(
  meta: { model: string; endpoint: string; prompt?: string; label?: string },
  fn: () => Promise<T>
): Promise<T> {
  // Use an explicit label as the prompt_hash when provided (so call sites are
  // human-distinguishable, e.g. "pipeline-extraction"); otherwise hash the prompt.
  const tag = meta.label ?? hashPrompt(meta.prompt ?? "");
  const start = Date.now();
  try {
    const result = await fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usage = (result as any)?.usage ?? {};
    traceLLMCall({
      model: meta.model,
      endpoint: meta.endpoint,
      prompt_hash: tag,
      latency_ms: Date.now() - start,
      input_tokens: usage.promptTokens ?? usage.inputTokens ?? 0,
      output_tokens: usage.completionTokens ?? usage.outputTokens ?? 0,
      status: "success",
    });
    return result;
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statusCode = (err as any)?.statusCode;
    const msg = err instanceof Error ? err.message : "unknown error";
    const rateLimited = statusCode === 429 || /429|quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(msg);
    traceLLMCall({
      model: meta.model,
      endpoint: meta.endpoint,
      prompt_hash: tag,
      latency_ms: Date.now() - start,
      input_tokens: 0,
      output_tokens: 0,
      status: rateLimited ? "rate_limited" : "error",
      error_message: msg.slice(0, 300),
    });
    throw err;
  }
}
