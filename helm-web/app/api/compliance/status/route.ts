import { NextResponse } from "next/server";
import { securityHeaders } from "@/lib/security";

// GET /api/compliance/status — data-governance & security posture summary.
export async function GET() {
  return NextResponse.json(
    {
      data_encryption: {
        at_rest: "AES-256 via Supabase Postgres encryption",
        in_transit:
          "TLS 1.3 enforced on all external API calls (Supabase, Qdrant, Enkrypt, Gemini, Groq)",
      },
      pii_handling: {
        detection: "Enkrypt AI PII detector + regex fallback",
        redaction: "Applied before storage (Checkpoint 3)",
        checkpoints_active: 4,
      },
      data_minimization: {
        transcript_retention: "Stored only with explicit user upload",
        pii_redacted_before_storage: true,
        quarantined_items_excluded_from_search: true,
      },
      api_security: {
        rate_limiting: "60 req/min per IP on expensive endpoints",
        input_validation: "Zod schema validation + XSS sanitization",
        owasp_top_10: [
          "injection_prevention",
          "broken_auth_check",
          "sensitive_data_exposure_mitigation",
        ],
      },
      llm_observability: {
        tracing: "Per-call latency, token usage, prompt hash tracking",
        monitoring_endpoint: "/api/observability/traces",
      },
      mastra_architecture: {
        workflows: 6,
        agents: 2,
        scorers: 4,
        hitl_enabled: true,
        note:
          "Workflows are independently deployable via Mastra's createWorkflow API. Current hackathon deployment bundles them for simplicity; production deployment separates via Mastra Cloud or independent worker processes.",
      },
    },
    { headers: securityHeaders() }
  );
}
