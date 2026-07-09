import { NextResponse } from "next/server";
import { securityHeaders } from "@/lib/security";

// GET /api/architecture — structured description of the system architecture.
export async function GET() {
  return NextResponse.json(
    {
      service_decomposition: {
        model:
          "Mastra workflows are independent, composable units (createWorkflow/createStep). Each can run standalone or be scheduled.",
        workflows: [
          { id: "pipeline-supervisor", role: "extract → validate → trust-score → PII → eval-score" },
          { id: "risk-monitor", role: "deadline/silence/dependency risk state machine" },
          { id: "followup-hitl", role: "draft → policy check → human approval (suspend/resume)" },
          { id: "reminder", role: "due items → dedup → reminders → Slack" },
          { id: "weekly-report", role: "7-day aggregation → persist → Slack" },
          { id: "strategic-insight", role: "5 strategic-intelligence engines" },
        ],
        agents: ["extractionAgent", "followupAgent"],
        scorers: ["itemCount", "ownerAccuracy", "typeAccuracy", "sourceQuotePresence"],
      },
      data_flow:
        "Upload/record → (Groq Whisper if audio) → Enkrypt injection gate → extraction agent (Zod-validated) → " +
        "Enkrypt adherence/relevancy trust scoring → trust-tier routing (auto/review/quarantine) → Enkrypt PII redaction → " +
        "Supabase (structured) + Qdrant (embeddings, quarantined excluded) → contradiction & dependency resolution via Qdrant.",
      security_layers: [
        "TLS 1.3 on all external calls",
        "Enkrypt 4-checkpoint safety (injection, adherence, PII, policy)",
        "Zod schema validation + XSS input sanitization",
        "In-memory rate limiting (Redis in production)",
        "Security headers (CSP, HSTS, X-Frame-Options, nosniff)",
      ],
      compliance_measures: [
        "PII redacted before storage",
        "Quarantined (low-trust) items excluded from search/RAG",
        "Per-call LLM observability (latency, tokens, prompt hash)",
        "AES-256 encryption at rest (Supabase)",
      ],
      scalability_approach:
        "Mastra workflows support independent deployment via createWorkflow; current deployment is monolithic for hackathon speed. " +
        "Production would use Mastra Cloud for workflow-level scaling, plus a Redis-backed rate limiter and an OTel collector for traces.",
      persistence: {
        mastra_runs: "LibSQL (file store) — workflow runs + HITL suspend/resume survive restarts",
        structured_data: "Supabase Postgres",
        vectors: "Qdrant (meeting_items, transcript_chunks, documents — 3072d gemini-embedding-001)",
      },
    },
    { headers: securityHeaders() }
  );
}
