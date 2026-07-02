# Helm — Demo Runbook (Phase 7)

## Before you present (7.3 polish checklist)
- [ ] `cd helm-web && npm run dev` — confirm it comes up on **http://localhost:3000** (kill any stale `node` on 3000 first; if it grabs 3001 you have a leftover process).
- [ ] Sign in once (or sign up) — the app has an auth guard, so you must be logged in.
- [ ] Supabase has clean data from at least 3 meetings (upload the sample transcripts below if empty).
- [ ] Dark mode looks right (the app is dark by default — `dark` class is forced in the root layout).
- [ ] Bookmarks ready: `/`, `/upload`, `/items`, `/review`, `/followups`, `/search`.
- [ ] Test on the actual demo device/browser once end-to-end.
- [ ] (7.2) Screen-record the full flow below as a backup in case wifi fails.

Sample transcripts live in `Helm/evals/sampleTranscripts/` (`transcript_03_demo.txt` is the demo one).

## The demo flow (7.1)
1. **Upload** → `/upload`: paste `transcript_03_demo.txt` (or drag an audio file — Groq Whisper transcribes it), give it a title, **Process transcript**. Watch the live pipeline log (injection check → extract → Enkrypt trust scoring → embed).
2. **Trust in action** → `/review`: the fabricated / unsupported item is **quarantined** (Enkrypt adherence = 0). Accept, edit, or discard.
3. **Dashboard** → `/`: items with trust-score badges, priority-sorted (blocked → at-risk → open → done), the voice **briefing** button, and the two charts (items/day + status breakdown).
4. **Risk scan**: click **⚡ Run risk scan** — action items past/near deadline flip to **at-risk / blocked** with explainable reasons.
5. **Ask** → dashboard search or `/search`: "Why did we switch databases?" → semantic results (AI answer card appears once the ask agent returns `answer`).
6. **Follow-up**: on an at-risk item click **✉️ Draft follow-up** → `/followups` → **Approve & send**.

## Feature tour (the rest of the build)
- **Items** `/items`: kanban — drag a card between columns, status persists to Supabase. Click a card → full detail (`/items/[id]`) with inline edit, dependencies, supersede chain, source quote.
- **Decisions** `/decisions`: decision log with supersede chains + contradiction alerts.
- **Meetings** `/meetings`: list → detail with transcript + extracted items side-by-side.
- **Chat** `/chat`: channels + DMs (mock data; realtime subscription wired for when the tables land).
- **Calendar** `/calendar`: item deadlines colored by status; **+ New room** starts a live Jitsi meeting (`/rooms/[id]`).
- **Team** `/team`: role-aware status table (VP aggregates downstream; manager sees reports).
- **Reports** `/reports`: weekly report cards with ROI badges + strategic signals.
- **Settings** `/settings`: edit project, manage member roles, notifications; integrations & intelligence sub-pages.

## Known mock / pending-Member-1 spots (say this if asked)
Chat data, weekly reports, dashboard insights, integrations, and adaptive-intelligence controls render with sample data and switch to live automatically once Member 1's tables/APIs ship. Everything else (items, decisions, meetings, search, trust scoring, risk scan, follow-ups, calendar deadlines, team) is real Supabase/Qdrant/Enkrypt data.
