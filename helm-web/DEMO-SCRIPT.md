# Helm — 5-Minute Hackathon Demo Script

> **One-liner:** _"Most meeting tools stop at summaries. Helm closes the loop — extract, validate, remember, monitor, and act."_

---

## ⚠️ Critical pre-flight (read this first — these WILL sink the demo if skipped)

1. **Gemini free-tier quota is 20 requests/DAY.** A single pipeline upload uses ~8. **Do your live-upload rehearsal on a DIFFERENT day than the demo, or use a fresh Google AI Studio key**, and set it in `.env.local` (`GOOGLE_GENERATIVE_AI_API_KEY`). If quota is gone, the upload and Ask-mode will 429 → **use the Backup Plan.**
2. **Pre-populate the database before going on stage** (run the demo transcript through the pipeline once earlier in the day). The quarantined `$50,000` row and extracted items should already exist so the Review Queue, Search, and Items pages are populated even if the live upload fails.
3. **Run pending migrations** in the Supabase SQL editor (safe, idempotent):
   ```sql
   ALTER TABLE rooms ADD COLUMN IF NOT EXISTS title TEXT;
   ALTER TABLE escalation_logs ADD COLUMN IF NOT EXISTS run_id TEXT;
   ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
   CREATE TABLE IF NOT EXISTS agent_prompts (agent_id TEXT PRIMARY KEY, name TEXT, prompt TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT now());
   ```
4. **Give the demo manager real direct reports** (so `/team` isn't empty). If demoing as **Priya**, run:
   ```sql
   UPDATE users SET manager_id = (SELECT id FROM users WHERE email='priya@helm.dev')
   WHERE role='employee';
   ```
   (Employees are currently assigned to Muthiah Kasi — reassign to whichever manager you demo as.)
5. **Use `localhost:3000`, not the `192.168.x.x` network URL** — browsers block mic/screen capture on non-secure origins (only relevant if you demo live recording).
6. **Disable ad-blockers / Brave Shields** on the demo browser — they block Jitsi's `external_api.js` (only relevant for the live-meeting feature; not in this core script).

---

## Pre-demo setup (before going on stage)

1. Log in as **Priya** (`priya@helm.dev`, manager role) at `localhost:3000`.
2. Open `Helm/evals/sampleTranscripts/transcript_03_demo.txt` in a text editor, ready to copy. _(This transcript is built for the demo: it contains a fabricated "$50,000 Q3 marketing budget" line that Enkrypt quarantines.)_
3. Clear the browser console (so any logs you point to are fresh).
4. Second browser / incognito window ready, logged in as **Rahul** (`rahul@helm.dev`, employee role) on the dashboard.
5. Have `dev`/`start` server already running and warm (visit each page once so Next.js has compiled them — no first-hit spinners on stage).

---

## The Script (5 minutes)

### ⏱ Minute 1 — The Problem + Upload (60s)

> **Say:** _"Most meeting tools stop at a summary. Helm closes the loop — it extracts action items and decisions, validates every one against the source with Enkrypt AI, remembers them across meetings, and follows up. Let me show you."_

- **Dashboard** (already open): gesture at the real metrics, charts, and the "Review queue" badge. _"This is all live data — no mock."_
- Click **Upload** → paste `transcript_03_demo.txt` → submit.
- **Say while it runs:** _"Helm isn't just extracting text. Every item is being fact-checked against the transcript — adherence and relevancy — by Enkrypt AI, and PII is redacted before anything is stored."_
- Wait for completion (returns item counts + a step log).

> **If it spins >5s or errors → cut to Backup Plan immediately.** Say: _"Here's what Helm extracted from this meeting earlier today,"_ and continue to Minute 2 with the pre-populated data.

---

### ⏱ Minute 2 — Trust & Safety Layer (60s) — _the money moment_

- Go to **Review Queue** (`/review`).
- Point to the **quarantined** item:
  > _"This item — 'the board approved a $50,000 budget increase' — was **quarantined at trust score 0.4**. Enkrypt's checks found it's ungrounded relative to what the meeting was actually about. **This is our hallucination catch** — it never reaches the dashboard or search."_
- Point to a **pending_review (0.7)** item:
  > _"This one is real but off-topic, so it's flagged for a human — not auto-trusted, not dropped."_
- Click **Discard** on the quarantined item; **Accept** the valid ones.

> **Say:** _"Four Enkrypt checkpoints run in the pipeline: injection detection on the raw transcript, adherence + relevancy on every extracted item, PII redaction before storage, and a policy check on outgoing follow-ups."_

---

### ⏱ Minute 3 — Intelligence & Memory (60s)

- Go to **Search** (`/search`) → toggle **Ask** mode → type:
  > `What decisions were made about the mobile app launch?`
- Show the **cited answer** with `[Meeting Title]` references.
  > **Say:** _"This is RAG over **three Qdrant collections** — meeting items, transcript chunks, and uploaded documents — with project-scoped payload filters, and quarantined items are excluded so a hallucination can never surface in an answer."_
- Go to **Items** (`/items`) → show the **Kanban board** with real items → **drag one** between columns.
  > **Say:** _"Status persists to Supabase — drag-and-drop is real."_

> **Quota note:** Ask-mode uses one Gemini call. If quota is gone, **skip the Ask query** and instead do a plain **Search** (no LLM — pure Qdrant vector search, always works), then show the Kanban.

---

### ⏱ Minute 4 — Proactive Follow-through (60s)

- On the **Dashboard**, click **"Run risk scan"** ("Simulate next day").
  > _"No LLM here — it's a deterministic Mastra workflow applying deadline, silence, and dependency rules."_ (Quota-safe — always works.)
- Show items flip to **at-risk / blocked**.
- Go to **Approval Queue** (`/followups`) → show a **drafted follow-up**.
  > **Say:** _"The follow-up agent drafted this nudge through **Mastra's HITL workflow** — it ran the draft, passed an Enkrypt policy check, then **suspended for human approval**. Nothing gets sent without a human tap."_
- Click **Approve**. _(Resumes the suspended Mastra run.)_
- Open **Observability** (`/observability`).
  > **Say:** _"Every LLM call is traced — model, latency, token usage, prompt hash, and status, including rate-limit hits."_

---

### ⏱ Minute 5 — Architecture & Enterprise Readiness (60s)

- Go to **Settings** (`/settings`): show **System Health** (green dots for Supabase, Qdrant, Enkrypt, Gemini, Groq) and **Pipeline Configuration**.
  > **Say:** _"6 Mastra workflows, 2 agents, 4 scorers, 4 Enkrypt checkpoints, 3 Qdrant collections — and role-based access."_
- **Switch to Rahul's browser** (employee). Show the dashboard's **"Your tasks"** section.
  > **Say:** _"Managers see org-wide team status; employees see their own tasks first. Same app, role-aware."_
- Open **`/api/compliance/status`** in a tab (pretty JSON).
  > **Say:** _"TLS 1.3 in transit, AES-256 at rest, rate limiting, Zod + XSS input validation, and PII redaction before storage — GDPR-minded data governance, all inspectable."_

> **Close:** _"Helm isn't a notetaker — it's an **AI Chief of Staff** that closes the loop from meeting to execution."_

---

## 🛟 Backup Plan (if the pipeline fails live)

- **Root cause 99% of the time: Gemini daily quota (429) or network.** Don't debug on stage.
- Pre-populate the DB earlier in the day (run `transcript_03_demo.txt` through the pipeline once). Then:
  - **Skip the upload.** Say: _"Here's what Helm extracted from a meeting earlier today,"_ and go straight to the **Review Queue** — the quarantined `$50k` row and valid items are already there.
- **Lean on the quota-safe moments** (all work with zero LLM calls):
  - Review Queue, Items/Kanban (drag), Risk scan, Approval Queue (Approve), Observability, Settings, Compliance endpoint, plain Search (vector-only).
- **Quota-dependent moments** (have screenshots or a screen-recording as backup): the live Upload, Ask-mode answer, Insights (cross-project engine).
- **Never show a spinner for more than 5 seconds.** If something hangs, narrate over a pre-recorded clip or move on.

---

## 🎯 Judge-facing talking points (weave these in)

- **Mastra (25%):** _"Mastra orchestrates **6 registered workflows** — including real **HITL suspend/resume** for follow-up approval — backed by LibSQL so runs persist across restarts. Plus 2 agents and 4 eval scorers that run live in the pipeline."_
- **Qdrant (20%):** _"Qdrant powers **hybrid search across 3 collections** (meeting_items, transcript_chunks, documents) with project-scoped payload filters, quarantine exclusion, dependency resolution, and cross-meeting contradiction detection."_
- **Enkrypt (20%):** _"Enkrypt AI gates the pipeline at **4 checkpoints** — injection on input, adherence + relevancy on output (which drives trust-tier routing and the quarantine you saw), PII before storage, and policy on follow-ups."_
- **Agent quality (20%):** _"Extraction output is Zod-schema-validated, scored live by 4 deterministic scorers, and there's a runnable golden eval at `/api/evals/run`."_
- **Impact/novelty (15%):** _"It closes the loop — extract → validate → remember → monitor → act → reason — with org-aware escalation, not just a summary."_
- **Cost:** _"Everything runs on **free tiers** — Gemini Flash, Qdrant Cloud, Supabase, Enkrypt, Groq Whisper."_

---

## Quick reference — pages & endpoints used

| Moment | Route |
|---|---|
| Dashboard / role view | `/` |
| Upload | `/upload` |
| Review Queue (quarantine) | `/review` |
| Search / Ask (RAG) | `/search` |
| Items / Kanban | `/items` |
| Approval Queue (HITL) | `/followups` |
| Observability (traces) | `/observability` |
| Settings (health/config) | `/settings` |
| Compliance JSON | `/api/compliance/status` |
| Architecture JSON | `/api/architecture` |
| Golden eval | `POST /api/evals/run` |

**Accounts:** Priya `priya@helm.dev` (manager) · Rahul `rahul@helm.dev` (employee).
