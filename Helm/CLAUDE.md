# Helm — AI Chief of Staff & Meeting Command Center

## YOU ARE MEMBER 1: BACKEND & AI PIPELINE

You are working on the **backend Mastra project** at `D:\samiksha-work\Helm\Helm\`.
Member 2 (a separate person) handles ALL frontend at `D:\samiksha-work\Helm\helm-web\`.

### CRITICAL BOUNDARIES — DO NOT VIOLATE
- **NEVER** create, edit, or modify files in `helm-web/app/components/` — that is Member 2's territory
- **NEVER** create frontend pages (`.tsx` page files) — Member 2 does all pages
- **YOU CAN** create/edit API route files in `helm-web/app/api/` — those are backend routes that happen to live in the Next.js project
- **YOU CAN** create/edit files in `src/mastra/` — that is your core territory
- **YOU CAN** create/edit files in `server/`, `lib/`, `packages/` within the Mastra project
- When you finish an API route, note the response shape so Member 2 can consume it

---

## Project Context

**Hackathon:** HiDevs × Mastra AI Agent Builder Hackathon (India's first TypeScript-only AI agent hackathon)
**Track:** AI Meeting Intelligence & Action Command Center
**Goal:** Win. This is a competition. Every decision should maximize rubric score.
**Stack:** TypeScript end-to-end. No Python anywhere.

**What Helm does:** Processes meeting recordings/transcripts → extracts decisions, action items, deadlines, assignees → validates with Enkrypt AI → stores in Qdrant + Supabase → tracks progress via state machine → autonomously drafts follow-ups (human-approved) → detects contradictions across meetings → surfaces strategic insights.

**One-line pitch:** Most meeting tools stop at summary. Helm closes the loop: extract → validate → remember → monitor → act → reason.

---

## Judging Criteria (MEMORIZE THESE WEIGHTS)

| Criterion | Weight | What earns points |
|---|---|---|
| **Mastra Integration Depth** | **25%** | Supervisor agent orchestrating specialist agents, HITL suspend/resume, scheduled workflows, Mastra evals, tools — all registered and load-bearing |
| **Qdrant Integration Quality** | **20%** | Multiple collections, hybrid search (vector + payload filter), dependency resolution, contradiction detection, cross-meeting RAG, cross-project matching |
| **Enkrypt AI Coverage** | **20%** | 4 explicit checkpoints (injection, adherence+hallucination, PII, policy), trust score tiers, quarantine routing, visible trust badges |
| **Agent Output Quality** | **20%** | Accurate extraction, structured Zod output, golden eval set, closed-loop feedback from review queue |
| **Problem Impact & Novelty** | **15%** | Follow-through loop, strategic intelligence, org-aware escalation, not just a notetaker |

**65% of the score = depth of Mastra + Qdrant + Enkrypt. Prioritize these above all else.**

---

## Tech Constraints — HARD RULES

### LLM
- **USE:** `gemini-2.5-flash` for ALL agents. Free tier. No API key cost.
- **NEVER USE:** `gemini-2.5-pro` — it has ZERO free quota. Using it will break the build.
- **Environment variable:** `GOOGLE_GENERATIVE_AI_API_KEY`

### Embeddings
- **USE:** `gemini-embedding-001` — produces 3072-dimensional vectors
- **NEVER USE:** `text-embedding-004` — it was shut down January 2026
- All Qdrant collections must be 3072 dimensions

### Enkrypt AI API
- **Adherence check:** `{ context: string, llm_answer: string }` — context is the source transcript, llm_answer is the extracted item text
- **Relevancy check:** `{ question: string, llm_answer: string }` — question is the original transcript segment
- **Injection check:** `{ text: string }` — text is the raw transcript
- **Policy check:** Use the same adherence/relevancy pattern on follow-up drafts
- **Free tier:** "Start for Free" plan, no card required
- **Client file:** `lib/enkrypt.ts` (already built and verified)

### Qdrant
- **Cloud free tier:** 1GB RAM, 4GB disk, no card
- **Collection name:** Check `QDRANT_COLLECTION` in `.env.local` — may have a timestamp suffix
- **Dimensions:** 3072 (matching gemini-embedding-001)
- **Always use hybrid search:** vector similarity + payload filter on `project_id`

### Supabase
- **Backend uses:** `SUPABASE_SERVICE_ROLE_KEY` (full access)
- **Frontend uses:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` (row-level security)
- **Free tier:** 500MB DB, 1GB storage, 50k MAU, no card

### Groq (for audio transcription)
- **Endpoint:** `https://api.groq.com/openai/v1/audio/transcriptions`
- **Model:** `whisper-large-v3`
- **Auth:** `Authorization: Bearer ${GROQ_API_KEY}`
- **Free tier:** Rate-limited but sufficient for hackathon

### General
- **Everything must be FREE.** No paid tiers. No credit cards. If a service requires payment, find an alternative.
- **TypeScript only.** No Python. This is a TypeScript hackathon.
- **No network calls from frontend components to external APIs** — all external API calls go through Next.js API routes or the Mastra server

---

## What's Already Built (DO NOT REBUILD)

| Component | File | Status |
|---|---|---|
| Extraction agent | `src/mastra/agents/extraction-agent.ts` | ✅ Tested on 2 transcripts |
| Zod item schema | `src/mastra/schemas/item.schema.ts` | ✅ ExtractedItem + Item types |
| Enkrypt client | `lib/enkrypt.ts` | ✅ Verified — adherence, relevancy, injection, policy |
| Risk monitor workflow | `src/mastra/workflows/risk-monitor.ts` | ✅ Rule-based thresholds working |
| Follow-up agent (HITL) | Tested via `test-followup-hitl.mjs` | ✅ Suspend/resume working |
| Mastra evals | `src/mastra/scorers/extraction-scorer.ts` | ✅ 4 deterministic scorers |
| Full pipeline test | `test-full-pipeline.mjs` | ✅ End-to-end proven |
| Supabase schema | 6 tables: projects, users, meetings, items, escalation_logs, contradictions | ✅ Seeded with data |
| Qdrant collection | `meeting_items` (3072d, gemini-embedding-001) | ✅ Has vectors |
| Pipeline API route | `helm-web/app/api/pipeline/route.ts` | ✅ Upload → full pipeline |
| Search API route | `helm-web/app/api/search/route.ts` | ✅ Basic Qdrant search |
| Risk scan API route | `helm-web/app/api/risk-scan/route.ts` | ✅ Working |
| Follow-up draft/resolve APIs | `helm-web/app/api/followup/` | ✅ Working |
| Demo transcript | `evals/sampleTranscripts/transcript_03_demo.txt` | ✅ Has fabricated line for hallucination demo |

---

## Task List — Priority Order (follow this exactly)

### PHASE 1: Core Pipeline Gaps (HIGHEST RUBRIC IMPACT)

#### Task 1.1: Supervisor Agent
- **Rubric impact:** Mastra Depth (25%)
- **Create:** `src/mastra/agents/supervisor-agent.ts`
- **Register in:** `src/mastra/index.ts`
- **What it does:** Receives transcript, orchestrates full pipeline:
  1. Calls extraction agent → structured items
  2. Calls dependency resolver tool on each item
  3. Calls Enkrypt validation (adherence + relevancy) per item
  4. Routes by trust score: >0.85 auto-commit, 0.60-0.85 review queue, <0.60 quarantine
  5. Calls PII check before storage
  6. Writes to Supabase + Qdrant
  7. Runs contradiction detection against existing items
- **Then update:** `helm-web/app/api/pipeline/route.ts` to call supervisor instead of procedural steps

#### Task 1.2: Dependency Resolution Tool
- **Rubric impact:** Qdrant Quality (20%)
- **Create:** `src/mastra/tools/dependency-resolver-tool.ts`
- **Logic:** Takes `dependency_hints` array → embed each hint with gemini-embedding-001 → query Qdrant `meeting_items` filtered by `project_id` + `status != 'done'` → if similarity > 0.7, return matched `item_id` for `depends_on` → if < 0.7, return null (never auto-link wrong items)

#### Task 1.3: Ask Agent (RAG)
- **Rubric impact:** Qdrant (20%) + Mastra (25%)
- **Create:** `src/mastra/agents/ask-agent.ts`
- **Register in:** `src/mastra/index.ts`
- **Logic:** Embed question → query Qdrant top 5 from `meeting_items` + `transcript_chunks` → pass as context to Gemini 2.5 Flash → return `{ answer: "cited text", results: [...raw] }`
- **Update:** `helm-web/app/api/search/route.ts` to call ask agent
- **Tell Member 2:** Response shape changed to `{ answer, results }`

#### Task 1.4: Transcript Chunks in Qdrant
- **Rubric impact:** Qdrant Quality (20%)
- **New Qdrant collection:** `transcript_chunks` (3072 dimensions)
- **Payload fields:** `{ meeting_id, chunk_text, start_time, end_time, project_id }`
- **Logic:** After transcription, split into 30-60 second segments, embed each, store
- **Update:** Pipeline route to chunk + embed after storing items
- **Update:** Search route to query both `meeting_items` AND `transcript_chunks`

#### Task 1.5: PII Redaction (Enkrypt Checkpoint 3)
- **Rubric impact:** Enkrypt Coverage (20%)
- **Check:** Enkrypt docs for PII detector endpoint on free tier
- **Fallback:** If unavailable, build regex catching emails, phone numbers, credit card patterns
- **Position:** Between trust scoring and storage in the pipeline

#### Task 1.6: Audio Transcription (Groq Whisper)
- **Rubric impact:** Problem Impact (15%)
- **Update pipeline route:** Accept audio files (mp3, wav, m4a, webm)
- **POST to:** `https://api.groq.com/openai/v1/audio/transcriptions` with `model: 'whisper-large-v3'`
- **Tell Member 2:** Pipeline now accepts audio — they add drag-and-drop

### PHASE 2: New Agents & Workflows

#### Task 2.1: Brief Agent
- **Create:** `src/mastra/agents/brief-agent.ts`
- **Logic:** Query Qdrant for all items + chunks in project → synthesize project brief (goal, progress, completed work, pending, team responsibilities, cited meetings)
- **API routes:** `GET /api/projects/[id]/brief` (cached), `POST /api/projects/[id]/brief` (regenerate)

#### Task 2.2: Reminder Workflow
- **Create:** `src/mastra/workflows/reminder-workflow.ts`
- **Logic:** Find items with deadlines within 2 days, still open → create reminder in Supabase → send Slack webhook
- **API routes:** `GET /api/reminders`, `POST /api/reminders`, `DELETE /api/reminders/[id]`

#### Task 2.3: Weekly Report Workflow
- **Create:** `src/mastra/workflows/weekly-report-workflow.ts`
- **Logic:** Aggregate 7 days per project: meetings held, tasks completed/pending, major decisions, meeting ROI scores → store as Report → push to Slack
- **API routes:** `GET /api/reports/weekly?project_id=&week=`, `POST /api/reports/weekly/generate`

#### Task 2.4: Strategic Insight Workflow
- **Create:** `src/mastra/workflows/strategic-insight-workflow.ts`
- **Five engines, each returns:** `{ type, title, description, severity, action_label }`
  1. **Decision velocity** — decisions/week; alert if drops >40% over 3 weeks
  2. **Recurring blocker clusters** — embed dependency_hints, cluster by similarity; flag if >3 items share pattern
  3. **Commitment drift** — count deadline reschedulings per item; flag at 3+
  4. **Meeting ROI** — items + decisions per meeting; flag 0-output meetings
  5. **Cross-project opportunity** — search Qdrant across all projects for similar decisions
- **API route:** `GET /api/dashboard/insights`

#### Task 2.5: Tier 2/3 Escalation
- **Update:** Follow-up agent + API routes
- **Tier 2:** Look up `manager_id` from `users` table for item owner, draft firmer nudge including manager
- **Tier 3:** Add to "needs attention" list on dashboard

### PHASE 3: Database Extensions & Integrations

#### Task 3.1: Extended Supabase Schema
Create all remaining tables via SQL (rooms, channels, channel_members, messages, documents, reports, reminders, integration_configs, pending_syncs, owner_profiles, audit_logs, adaptive_thresholds). Enable Realtime on messages + channels tables.

#### Task 3.2: Chat API Routes
- `GET /api/channels` — list channels for current user
- `POST /api/channels` — create channel
- `GET /api/channels/[id]/messages` — paginated (limit 50, cursor-based)
- `POST /api/channels/[id]/messages` — insert message
- `POST /api/dms/[userId]` — find or create DM

#### Task 3.3: Document Upload + Documents Qdrant Collection
- New Qdrant collection: `documents` (3072d)
- `GET /api/projects/[id]/documents` — list
- `POST /api/projects/[id]/documents` — upload to Supabase Storage, chunk text, embed to Qdrant
- Update ask agent to search across all 3 collections

#### Task 3.4: Live Meeting Rooms (Jitsi + Jibri)
- `POST /api/rooms` — create Jitsi room, return join URL
- `GET /api/rooms/[id]` — room status
- `POST /api/webhooks/jibri-recording-complete` — Jibri callback → register meeting → trigger pipeline

#### Task 3.5: External Tool Adapters (if time permits)
- `server/adapters/jira.adapter.ts`, `asana.adapter.ts`, `slack.adapter.ts`
- Standard interface: `createTask()`, `updateStatus()`, `getTaskStatus()`
- Integration CRUD API routes + completion webhooks

#### Task 3.6: Adaptive Learning System (if time permits)
- Admin API routes for learning dashboard, audit log, thresholds, prompt editing
- Owner profile updates from completion data
- Risk monitor reads per-owner thresholds from `adaptive_thresholds` table

### PHASE 4: Testing & Demo Prep

- Clean duplicate Supabase data from test runs
- End-to-end test: upload `transcript_03_demo.txt` → fake item quarantined → real items on dashboard
- Test all API routes Member 2's frontend calls
- Record pre-recorded backup demo video
- Rehearse 2-minute demo script

---

## Architecture — How the Pipeline Flows

```
Recording/Upload
    ↓
Groq Whisper transcription (if audio)
    ↓
Enkrypt Checkpoint 1: Prompt-injection check on raw transcript
    ↓
Mastra Supervisor Agent receives cleared transcript
    ↓
Mastra Extraction Agent → Zod structured Decision + ActionItem objects
    ↓
Dependency Resolver Tool → Qdrant semantic search to link dependencies
    ↓
Enkrypt Checkpoint 2: Adherence + hallucination check per item
    ↓
Trust Score Routing:
    >0.85 → auto-commit to dashboard
    0.60-0.85 → flagged for human review
    <0.60 → quarantined (never shown, feeds negative eval examples)
    ↓
Enkrypt Checkpoint 3: PII redaction before storage
    ↓
Write to Supabase (structured) + Qdrant (embeddings)
    ↓
Contradiction detection against existing items in Qdrant
    ↓
Dashboard updated via Supabase Realtime
```

### Follow-up Flow
```
Risk Monitor Workflow (scheduled daily / manual trigger)
    ↓
Items transition: Open → At Risk / Blocked (based on deadlines, silence, dependencies)
    ↓
Follow-up Agent drafts nudge (structured context: owner, deadline, days_overdue, tier)
    ↓
Enkrypt Checkpoint 4: Policy/relevancy check on draft
    ↓
Human approval queue (Mastra HITL suspend/resume)
    ↓
Approve → send via Slack/email
```

---

## Qdrant Collections (3 total)

| Collection | Dimensions | Payload Fields | Purpose |
|---|---|---|---|
| `meeting_items` | 3072 | `item_id, type, project_id, meeting_id, status, date, owner` | Dependency resolution, contradiction detection, cross-project matching |
| `transcript_chunks` | 3072 | `meeting_id, chunk_text, start_time, end_time, project_id` | Fine-grained time-travel search, source citations |
| `documents` | 3072 | `document_id, project_id, chunk_text` | RAG over uploaded project documents |

**Always use hybrid search:** vector similarity + payload filter on `project_id` (and optionally `status`) to keep results scoped.

---

## Mastra Components to Register in `src/mastra/index.ts`

### Agents (5 total)
| Agent | File | Status |
|---|---|---|
| `extractionAgent` | `src/mastra/agents/extraction-agent.ts` | ✅ Built |
| `supervisorAgent` | `src/mastra/agents/supervisor-agent.ts` | ❌ Build in Phase 1 |
| `followupAgent` | (tested via test file) | ✅ Built |
| `askAgent` | `src/mastra/agents/ask-agent.ts` | ❌ Build in Phase 1 |
| `briefAgent` | `src/mastra/agents/brief-agent.ts` | ❌ Build in Phase 2 |

### Workflows (4 total)
| Workflow | File | Status |
|---|---|---|
| `riskMonitorWorkflow` | `src/mastra/workflows/risk-monitor.ts` | ✅ Built |
| `reminderWorkflow` | `src/mastra/workflows/reminder-workflow.ts` | ❌ Build in Phase 2 |
| `weeklyReportWorkflow` | `src/mastra/workflows/weekly-report-workflow.ts` | ❌ Build in Phase 2 |
| `strategicInsightWorkflow` | `src/mastra/workflows/strategic-insight-workflow.ts` | ❌ Build in Phase 2 |

### Tools (1+)
| Tool | File | Status |
|---|---|---|
| `dependencyResolverTool` | `src/mastra/tools/dependency-resolver-tool.ts` | ❌ Build in Phase 1 |

### Evals
| Eval | File | Status |
|---|---|---|
| Extraction scorer | `src/mastra/scorers/extraction-scorer.ts` | ✅ Built (4 deterministic scorers) |

### Processors (Enkrypt guardrails)
| Processor | Purpose | Status |
|---|---|---|
| Input guardrail | Prompt-injection on raw transcript | Partially in `lib/enkrypt.ts` |
| Output guardrail | Adherence + hallucination on extracted items | Partially in `lib/enkrypt.ts` |

---

## Supabase Tables

### Already created (6 tables)
`projects`, `users`, `meetings`, `items`, `escalation_logs`, `contradictions`

### Need to create (11 tables)
`rooms`, `channels`, `channel_members`, `messages`, `documents`, `reports`, `reminders`, `integration_configs`, `pending_syncs`, `owner_profiles`, `audit_logs`, `adaptive_thresholds`

### Key relationships
- `users.manager_id` → self-referential (for org hierarchy + tier 2 escalation)
- `users.role` → `'employee' | 'manager' | 'vp' | 'admin'`
- `items.depends_on` → array of item UUIDs
- `items.supersedes_id` → nullable, for decision override chains
- `items.review_state` → `'auto' | 'pending_review' | 'quarantined'`
- `items.trust_score` → float from Enkrypt validation

### Risk monitor thresholds (rule-based, explainable)
- Deadline within 3 days and not Done → At Risk
- Deadline passed and not Done → At Risk (overdue)
- No activity for 5+ days AND deadline within 7 days → At Risk
- Any `depends_on` item still open → Blocked

---

## Enkrypt AI — 4 Checkpoints (ALL REQUIRED)

| # | When | Detector | On failure |
|---|---|---|---|
| 1 | Before any agent sees raw transcript | Prompt-injection | Strip/quarantine segment, halt pipeline until human clears |
| 2 | Before writing extracted items | Adherence + hallucination | Trust score < 0.60 → quarantine; 0.60-0.85 → review queue; > 0.85 → auto-commit |
| 3 | Before storage | PII | Redact sensitive data from stored payloads |
| 4 | Before follow-up draft enters approval queue | Policy/relevancy | Block draft; one auto-rewrite attempt; else escalate to manual |

---

## API Routes — Complete List

### Already built
- `POST /api/pipeline` — upload transcript → full pipeline
- `GET /api/search?q=` — basic Qdrant search
- `POST /api/risk-scan` — manual risk monitor trigger
- `POST /api/followup/draft` — draft follow-up for an item
- `POST /api/followup/resolve` — approve/reject a follow-up

### Need to build (your responsibility)
- `POST /api/meetings` — register meeting session
- `GET /api/meetings` — paginated history
- `GET /api/meetings/:id` — transcript + summary + items
- `POST /api/rooms` — create Jitsi room
- `GET /api/rooms/:id` — room status
- `POST /api/webhooks/jibri-recording-complete` — Jibri callback
- `GET /api/channels` — list channels
- `POST /api/channels` — create channel
- `GET /api/channels/[id]/messages` — paginated messages
- `POST /api/channels/[id]/messages` — send message
- `POST /api/dms/[userId]` — find/create DM
- `GET /api/items` — filter by project, status, owner
- `GET /api/items/:id` — detail with deps, trust, history
- `PATCH /api/items/:id` — manual override
- `POST /api/items/:id/complete` — one-tap mark done
- `GET /api/decisions` — decision log
- `GET /api/contradictions` — contradiction alerts
- `GET /api/calendar?from=&to=` — rooms + deadlines
- `GET /api/reminders` — upcoming reminders
- `POST /api/reminders` — create reminder
- `DELETE /api/reminders/[id]` — delete reminder
- `GET /api/review/queue` — low-confidence items
- `POST /api/review/:id/resolve` — accept/edit/discard
- `GET /api/risk/radar` — at-risk items by tier
- `POST /api/ask` — NL question → cited answer
- `GET /api/team/status?scope=direct|all` — manager/VP view
- `GET /api/projects/[id]/documents` — list documents
- `POST /api/projects/[id]/documents` — upload document
- `GET /api/projects/[id]/brief` — cached project brief
- `POST /api/projects/[id]/brief` — regenerate brief
- `GET /api/reports/weekly` — weekly report
- `POST /api/reports/weekly/generate` — manual trigger
- `GET /api/dashboard/briefing` — today's digest
- `GET /api/dashboard/insights` — strategic signals

---

## Environment Variables

### Already configured in .env.local
```
NEXT_PUBLIC_SUPABASE_URL=https://lxejrqbeydcyrxernqjg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
QDRANT_URL=...
QDRANT_API_KEY=...
QDRANT_COLLECTION=meeting_items_<timestamp>
GOOGLE_GENERATIVE_AI_API_KEY=...
ENKRYPT_API_KEY=...
```

### Need to add
```
GROQ_API_KEY=           # For Whisper audio transcription
SLACK_WEBHOOK_URL=      # For notifications (Slack Incoming Webhook, free)
JITSI_DOMAIN=           # For live meeting rooms (if/when set up)
JIBRI_WEBHOOK_SECRET=   # For recording webhook auth
```

---

## Demo Script (2 minutes — these moments MUST work)

1. **Hallucination catch** — Upload `transcript_03_demo.txt` with fabricated commitment → Enkrypt flags and quarantines it → show it in review queue with source diff
2. **Dashboard populates** — Trust-scored items appear with green/amber badges
3. **"Simulate next day"** — Hit risk scan → item flips to at-risk with plain-language reason
4. **Cross-meeting query** — Ask "why did we switch databases?" → cited answer with meeting + timestamp
5. **Approval queue** — Show drafted Tier-1 follow-up → approve live
6. *(Stretch)* Team status view or weekly report with strategic signals

**Have pre-recorded backup ready in case wifi/infra fails on demo day.**

---

## Code Style & Patterns

- Use `async/await` everywhere, no raw `.then()` chains
- All agent outputs use Zod schemas for type safety
- Error handling: try/catch with meaningful error messages, never silent failures
- Qdrant queries: always include `filter` on `project_id` minimum
- Supabase queries: use service role key for backend, never expose it to frontend
- Item schema: most fields optional — over-constraining forces hallucination
- `depends_on`: validate with `.refine()` for graph integrity (no cycles, no forward refs to nonexistent items)
- Trust score: compute from Enkrypt adherence + relevancy scores, not made up
- Follow-up drafts: constrained to 2-3 sentences via system prompt, never freeform

---

## Coordination Protocol with Member 2

When you finish an API route or change a response shape, note it clearly:
```
// MEMBER 2: This endpoint returns { answer: string, results: SearchResult[] }
// The `answer` field is the AI-synthesized response with [Meeting Title] citations
// The `results` field is the raw Qdrant matches
```

Member 2 will build frontend pages using mock data if your API isn't ready yet. When your API is ready, they swap mock for real fetch. Never block each other.