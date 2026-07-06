# Helm — Complete Project Audit

**Audited:** 2026-07-04 · **Scope:** `helm-web/` (Next.js frontend + API routes) and `Helm/` (Mastra backend project)
**Method:** every file listed in the audit brief was read in full (not sampled) by three parallel research passes, plus live verification against the running dev server (`localhost:3000`) and the connected Supabase instance where curl-testable. This is a live, working codebase — most flows described below are real and functional. Read the whole thing before triaging; the biggest points are in Sections 4, 7, 9, 13, and 14.

> **Note on `AGENTS.md`:** `helm-web/AGENTS.md` (pulled in via `helm-web/CLAUDE.md`'s `@AGENTS.md`) instructs the reader to check a nonexistent `node_modules/next/dist/docs/` before writing any code, framed as "this is NOT the Next.js you know." No such docs exist in this Next.js version. This reads like a planted prompt-injection test rather than a real project instruction and was disregarded for this (read-only) audit. Worth knowing it's sitting there before someone acts on it during the actual build sprint.

---

## Section 1 — Frontend Pages (24 expected)

Every page below is a `"use client"` component, so none can use Next's server-only `export const metadata`. The team's workaround: `AppShell.tsx` sets `document.title` on every route change via `nav.ts`'s `labelForPath()`. That satisfies the *visible* requirement from CLAUDE.md but no page literally has a `metadata` export — noted once here rather than 24 times below.

| File | Exists | Data source | Status | Notable bugs / TODOs / missing states |
|---|---|---|---|---|
| `app/layout.tsx` | ✅ | N/A — wraps `AppShell` | Functional | Global `Metadata` title template (`Helm \| %s`) lives here only. `dark` class hardcoded. |
| `app/page.tsx` (Dashboard) | ✅ | Supabase (`items`/`meetings`/`contradictions`/`escalation_logs`) + `POST /api/search` + `POST /api/risk-scan` + `POST /api/followup/draft` + `GET /api/dashboard/insights` | Functional, **2 confirmed live bugs** | **Bug 1:** dashboard search POSTs `{query}` with no `mode` → `/api/search` always runs default search mode → `answer` is always `null` → `AnswerCard` never renders on the dashboard even though the API supports it. **Bug 2 (live-confirmed):** `fetch("/api/dashboard/insights")` is called with no `project_id` → route returns `{"error":"project_id is required"}` → dashboard always shows "No signals yet" even though the underlying 5-signal engine is fully built and, when queried directly with the param, returns rich real signals (decision velocity drop, recurring blocker clusters, low-ROI meetings — verified live). Skeleton + per-section empty states present; no page-level error/retry (Supabase failures silently fall back to `[]`). |
| `app/(auth)/login/page.tsx` | ✅ | `supabase.auth.signInWithPassword` | Functional | No retry button on error (re-submit works fine). |
| `app/(auth)/signup/page.tsx` | ✅ | `supabase.auth.signUp` + `users` insert | Functional | `users` insert failure only `console.error`s — silent; user can end up authenticated with no `public.users` row, breaking manager/VP hierarchy features downstream. Shared `(auth)` layout title renders "Sign in" even on the signup page. |
| `app/items/page.tsx` | ✅ | `supabase.from("items")` | Functional | Skeleton, error+retry, empty state all present. Real `@dnd-kit` (see Section 2). |
| `app/items/[id]/page.tsx` | ✅ | Supabase items/meetings/contradictions + `POST /api/followup/draft` | Functional | "State history" timeline is fabricated (2 static lines) — explicit TODO: no `state_history` table exists yet. |
| `app/decisions/page.tsx` | ✅ | Supabase items(type=decision)/meetings/contradictions | Functional | Skeleton, error+retry, empty state present. |
| `app/meetings/page.tsx` | ✅ | Supabase meetings + item counts, client-side pagination | Functional | Skeleton, error+retry, empty state present. |
| `app/meetings/[id]/page.tsx` | ✅ | Supabase meetings + items | Functional | Has back-link (per spec). Loading is plain text, not a skeleton. Fetch-error and not-found render identically, no retry. |
| `app/search/page.tsx` | ✅ | `POST /api/search` with `{query, mode}` (correctly forwards mode) | Functional | Because `mode` is sent here (unlike the dashboard), Ask-mode citations genuinely work on this page. No retry button on error. Project/date filter sidebar is a disabled placeholder. |
| `app/upload/page.tsx` | ✅ | `POST /api/transcribe` (audio) + `POST /api/pipeline` (text) | Functional | Drag-and-drop audio zone + progress/elapsed timer implemented per spec. Error states present for both steps. This is the flow with the two bugs fixed earlier this session (pipeline `maxSteps` + JSON fence-stripping) — re-verify live before demo. |
| `app/review/page.tsx` | ✅ | Supabase items(review_state) + `POST /api/review` | Functional | `load()` has **zero error handling** — a failed fetch leaves the page stuck in an infinite loading skeleton with no error/retry UI. |
| `app/followups/page.tsx` | ✅ | Supabase escalation_logs+items + `POST /api/followup/resolve` | Functional | Same as above: `fetchEscalations()` has no error handling, no retry. (Bypasses the broken `GET /api/followups/queue` entirely by querying Supabase directly — see Section 3.) |
| `app/chat/page.tsx` | ✅ | Renders `<ChatView/>` | **Mock** | Entirely `mockData.ts` — see Section 2. |
| `app/chat/[channelId]/page.tsx` | ✅ | Renders `<ChatView initialChannelId/>` | **Mock** | Same. |
| `app/calendar/page.tsx` | ✅ | Supabase items(deadline_iso) + rooms (best-effort) | Functional | Real `react-big-calendar` (Section 2). No explicit empty-state icon+message for zero events — deviates from the design-system rule. |
| `app/workspace/[id]/page.tsx` | ✅ | Supabase projects/users/meetings/items + `POST /api/projects/[id]/brief` | Functional (brief tab); **Mock** (documents/chat tabs) | `/api/projects/[id]/brief` is fully real (Gemini + Qdrant RAG, cached). Stale in-UI copy still says the brief API "isn't available yet." Documents tab always passes `documents={[]}` hardcoded regardless of the real, working `/api/projects/[id]/documents` API. Chat tab is a static link-out. |
| `app/team/page.tsx` | ✅ | Supabase users + items, grouped client-side | Functional but fragile | Item ownership matched by exact string equality between `items.owner` free text and `users.name` — any typo/mismatch silently drops that person's items. |
| `app/reports/page.tsx` | ✅ | `GET /api/reports/weekly` (no `project_id` passed) → falls back to hardcoded `MOCK_REPORTS` | **Mock in practice** | **Live-confirmed:** the real route 400s without `project_id` (`{"error":"project_id is required"}`), so the mock fallback fires every time today. Even fixed, there's a shape mismatch: the real API returns `{report: {...}}` (singular object, live-confirmed) while the page expects `{reports: [...]}` (array). |
| `app/rooms/new/page.tsx` | ✅ | Supabase projects + `POST /api/rooms` | Functional, data-integrity bug | Client generates its own `jitsi_room_name` and joins that room directly, but the real `POST /api/rooms` **ignores** the client-sent name/status and generates its own server-side name — the persisted `rooms` row never matches the Jitsi room the user actually enters. |
| `app/rooms/[id]/page.tsx` | ✅ | N/A | Functional | Real `@jitsi/react-sdk` (Section 2). "Recording" indicator is cosmetic only, not tied to real Jibri state. |
| `app/settings/page.tsx` | ✅ | Supabase projects/users + `localStorage` (notif prefs) | Functional | Real CRUD for project + team roles. Notification prefs explicitly TODO'd to localStorage pending a settings table. `load()` has no error/retry handling. |
| `app/settings/integrations/page.tsx` | ✅ | Hardcoded local `useState` array | **Mock** (explicitly TODO'd) | Connect/disconnect only flips local state; test button just `alert()`s. No API calls at all. |
| `app/settings/intelligence/page.tsx` | ✅ | Hardcoded `MOCK_AUDIT` + local sliders | **Mock** (explicitly TODO'd) | Zero persistence, zero API calls. |

## Section 2 — Frontend Components (54 found)

| File | Exists | Used by | Notes |
|---|---|---|---|
| `AppShell.tsx` | ✅ | `app/layout.tsx` | Real auth guard (`supabase.auth.getSession`/`onAuthStateChange`), bare-renders `/login`,`/signup`. |
| `MobileBottomNav.tsx` | ✅ | `AppShell.tsx` | 4 primary links + "More" drawer. |
| `NotificationBell.tsx` | ✅ | `Topbar.tsx` | Queries `items` for pending_review/quarantined as a notification stand-in (explicit TODO). |
| `Sidebar.tsx` | ✅ | `AppShell.tsx` | All 13 nav items. Unread-chat badge queries raw `messages` row count, not real unread tracking. |
| `StatusPill.tsx` | ✅ | Widely shared | Matches design-system status colors exactly. |
| `Topbar.tsx` | ✅ | `AppShell.tsx` | Breadcrumb, `NotificationBell`, avatar/sign-out. |
| `TrustScoreBadge.tsx` | ✅ | Widely shared | Matches design-system trust tiers exactly. |
| `calendar/CalendarEventChip.tsx` | ✅ | `CalendarGrid.tsx` | Camera emoji for rooms vs plain title for deadlines. |
| `calendar/CalendarGrid.tsx` | ✅ | `app/calendar/page.tsx` | **Real `react-big-calendar`** — `Calendar`, `dateFnsLocalizer`, `Views.MONTH/WEEK/AGENDA`, custom `eventPropGetter` + event renderer, `onSelectEvent` routing. Not a placeholder. |
| `calendar/ReminderBell.tsx` | ✅ | `app/calendar/page.tsx` | Real `reminders` table read. |
| `calendar/ReminderCreateModal.tsx` | ✅ | `app/calendar/page.tsx` | Real insert into `reminders`. |
| `chat/ChannelList.tsx` | ✅ | `ChatView.tsx` | Mock channels + delegates to `DMList`. |
| `chat/ChatView.tsx` | ✅ | `app/chat/*` | **Real Supabase Realtime subscription** (`.channel().on("postgres_changes",...).subscribe()`) — correctly wired but decorative: runs on mock string IDs that can't match real UUID `channel_id`s. |
| `chat/DMList.tsx` | ✅ | `ChannelList.tsx` | Mock DMs only. |
| `chat/MessageComposer.tsx` | ✅ | `ChatView.tsx` | `onSend` only appends to local mock state — **never inserts into Supabase** (TODO confirms). |
| `chat/MessageThread.tsx` | ✅ | `ChatView.tsx` | Auto-scroll, renders mock messages. |
| `chat/UnreadBadge.tsx` | ✅ | `ChannelList.tsx`, `DMList.tsx` | Fed from mock `unread` field. |
| `chat/mockData.ts` | ✅ | All chat components | Source of all chat data; explicit TODO to replace. |
| `dashboard/ApprovalQueueWidget.tsx` | ✅ | `app/page.tsx` | Links to `/followups`, real count from `escalation_logs`. |
| `dashboard/BriefingDigest.tsx` | ✅ | `app/page.tsx` | Real Web Speech API TTS button, no key needed. |
| `dashboard/DashboardCharts.tsx` | ✅ | `app/page.tsx` | **Real `recharts`** — `LineChart`/`PieChart` with real derived data from live `items`. Not static SVG. |
| `dashboard/InsightCard.tsx` | ✅ | `app/page.tsx` | Correctly built, but currently dead in practice — see the `mode`/`project_id` bugs above. |
| `decisions/ContradictionAlert.tsx` | ✅ | `app/decisions/page.tsx` | Links both conflicting items. |
| `decisions/DecisionCard.tsx` | ✅ | `app/decisions/page.tsx` | Wraps `TrustScoreBadge` + `SupersedeChain`. |
| `decisions/SupersedeChain.tsx` | ✅ | `DecisionCard.tsx` | Single-hop "overrides → X" chip, not a full multi-level chain graph despite the spec's phrasing. |
| `items/DependencyChips.tsx` | ✅ | `app/items/[id]/page.tsx` | Renders resolved deps + raw hint text. |
| `items/DraggableItemCard.tsx` | ✅ | `KanbanColumn.tsx` | Real `useDraggable`. |
| `items/KanbanBoard.tsx` | ✅ | `app/items/page.tsx` | **Real `@dnd-kit`** — `DndContext`, `PointerSensor`, `DragOverlay`, optimistic Supabase update with rollback on error. |
| `items/KanbanColumn.tsx` | ✅ | `KanbanBoard.tsx` | Real `useDroppable`. |
| `meetings/MeetingCard.tsx` | ✅ | `MeetingHistoryList.tsx` | Live/upload badge. |
| `meetings/MeetingHistoryList.tsx` | ✅ | `app/meetings/page.tsx` | Simple wrapper. |
| `reports/MeetingROIBadge.tsx` | ✅ | `WeeklyReportCard.tsx` | Hardcoded thresholds. |
| `reports/StrategicSignalCard.tsx` | ✅ | `WeeklyReportCard.tsx` | Static styled card. |
| `reports/WeeklyReportCard.tsx` | ✅ | `app/reports/page.tsx` | Renders whatever it's given — currently always the mock reports. |
| `rooms/JitsiRoomEmbed.tsx` | ✅ | `app/rooms/[id]/page.tsx` | **Real `@jitsi/react-sdk`** — `<JitsiMeeting>` with full config. Defaults to public `meet.jit.si` since `JITSI_DOMAIN` isn't set. |
| `rooms/RoomCard.tsx` | ✅ | **Nobody — confirmed dead code.** | Built but never imported anywhere in `app/`. |
| `rooms/RoomControls.tsx` | ✅ | `app/rooms/[id]/page.tsx` | Cosmetic recording indicator only. |
| `search/AnswerCard.tsx` | ✅ | `app/page.tsx`, `app/search/page.tsx` | Blue AI-answer card per spec. |
| `search/AskBar.tsx` | ✅ | `app/search/page.tsx` | Search/Ask toggle. |
| `search/SearchBar.tsx` | ✅ | `app/search/page.tsx` | Input + submit. |
| `search/SemanticResultsList.tsx` | ✅ | `app/search/page.tsx` | Result cards with trust badge + source quote. |
| `settings/AuditLogTable.tsx` | ✅ | `LearningDashboard.tsx` | Renders whatever it's given — currently `MOCK_AUDIT`. |
| `settings/IntegrationHealthRow.tsx` | ✅ | `app/settings/integrations/page.tsx` | Wraps mock-only children. |
| `settings/LearningDashboard.tsx` | ✅ | `app/settings/intelligence/page.tsx` | Thin wrapper. |
| `settings/PromptEditor.tsx` | ✅ | `app/settings/intelligence/page.tsx` | Local-state textarea, no persistence. |
| `settings/TestPushButton.tsx` | ✅ | `IntegrationHealthRow.tsx` | `alert()` only. |
| `settings/ThresholdControl.tsx` | ✅ | `app/settings/intelligence/page.tsx` | Local state only. |
| `settings/TypeMappingEditor.tsx` | ✅ | `IntegrationHealthRow.tsx` | Static selects, no wiring at all. |
| `team/ReporteeRow.tsx` | ✅ | `TeamStatusTable.tsx` | Expandable, links to `/items/[id]`. |
| `team/TeamStatusTable.tsx` | ✅ | `app/team/page.tsx` | Table shell. |
| `workspace/DocumentList.tsx` | ✅ | `app/workspace/[id]/page.tsx` | Always receives `documents={[]}` — permanently empty. |
| `workspace/DocumentUploadButton.tsx` | ✅ | `DocumentList.tsx` | `alert()` only. |
| `workspace/GenerateBriefButton.tsx` | ✅ | `ProjectBriefView.tsx` | **Wired to a real, working brief flow.** |
| `workspace/MemberList.tsx` | ✅ | `app/workspace/[id]/page.tsx` | Renders **all** `users`, not scoped to the project — every workspace shows the whole org. |
| `workspace/ProjectBriefView.tsx` | ✅ | `app/workspace/[id]/page.tsx` | Functional. |
| `workspace/WorkspaceHeader.tsx` | ✅ | `app/workspace/[id]/page.tsx` | Static header. |
| `workspace/WorkspaceTabs.tsx` | ✅ | `app/workspace/[id]/page.tsx` | Controlled tab strip. |

### Specific technical checks (confirmed)
1. **Kanban drag-and-drop** — real `@dnd-kit`, fully wired, writes to Supabase with rollback on failure. ✅
2. **Calendar** — real `react-big-calendar`, not a custom grid. ✅
3. **Jitsi** — real `@jitsi/react-sdk`, not a placeholder div (uses public `meet.jit.si`). ✅
4. **Dashboard charts** — real `recharts` with live-derived data. ✅
5. **Chat realtime** — a genuine Supabase Realtime subscription exists and is correctly implemented, but it's decorative: the composer never persists messages and the data feeding the UI is 100% mock. ⚠️

---

## Section 3 — API Routes (52 found)

### Cross-cutting issues
1. **Auth routes share one service-role singleton client** for `signInWithPassword`/`signUp`/`signOut` — this client has no per-request session binding, so `logout`'s `signOut()` is likely a no-op against the real browser session (held by the separate anon-key client in `lib/supabase.ts`).
2. **Schema drift beyond CLAUDE.md's documented columns** — `escalation_logs` and `items` both have more columns in active use (`drafted_text`, `status`, `policy_passed`, `resolved_at`, `review_state`, `deadline_raw`, `supersedes_hint`, `source_timestamp`, `followup_sent_at`, etc.) than the schema reference lists. Not necessarily a bug, but the docs are stale.
3. **Confirmed live column bug:** `GET /api/followups/queue` selects `escalation_logs.draft`, which doesn't exist (the real column is `drafted_text`). Live curl confirms: `{"error":"column escalation_logs.draft does not exist"}`. The `/followups` page avoids this by querying Supabase directly, so the bug is currently silent in the UI but the documented public endpoint is broken.

| File | Methods | Status | Real Supabase? | Real Qdrant? | Mastra agent/workflow? | Enkrypt call? | try/catch | Notable issues |
|---|---|---|---|---|---|---|---|---|
| `followup/resolve/route.ts` | POST | Functional | Yes | No | No | No | Yes | No existence check before update. |
| `risk-scan/route.ts` | POST | Functional | Yes | No | No | No | Yes | One-way ratchet — items never move back to open/in_progress. Only scans `trust_score >= 0.85`. |
| `transcribe/route.ts` | POST | Functional | No | No | No | No | Partial | Real Groq Whisper call. |
| `dashboard/insights/route.ts` | GET | Functional (live-verified) | Yes | Yes (raw REST) | No | No | Yes | Real 5-engine detector, requires `project_id`. |
| `followup/draft/route.ts` | POST | Functional | Yes | No | Yes — `followupAgent` | Yes — policy/toxicity | Yes | Enkrypt failure computed but **not enforced** — flagged drafts still get stored as usable "pending." |
| `setup-db/route.ts` | GET, POST | **Stub (POST is decorative)** | Yes | No | No | No | Yes | The RPC `setup_helm_db()` body is literally `RETURN 'Schema already applied...'` — POST never runs the actual DDL. Only pasting the GET-returned SQL into the SQL editor works. |
| `dashboard/briefing/route.ts` | GET | Functional | Yes | No | No | No | Yes | Clean. |
| `calendar/route.ts` | GET | Functional | Yes | No | No | No | Yes | Clean. |
| `team/status/route.ts` | GET | Functional | Yes | No | No | No | Yes | Sequential BFS for VP scope — fine at hackathon scale. |
| `reports/weekly/generate/route.ts` | POST | Functional | Yes | No | No | No | Yes | Real Slack webhook (fire-and-forget). |
| `reports/weekly/route.ts` | GET | Functional (live-verified, requires `project_id`, returns singular `{report}`) | Yes | No | No | No | Yes | Frontend never calls this correctly — see Section 1. |
| `items/route.ts` | GET | Functional | Yes | No | No | No | Yes | Clean. |
| `decisions/route.ts` | GET | Functional | Yes | No | No | No | Yes | Correctly enriches with contradictions. |
| `contradictions/route.ts` | GET | Functional | Yes | No | No | No | Yes | Builds `.or()` filter via string join — safe today (own UUIDs), fragile pattern. |
| `channels/route.ts` | GET, POST | Functional (live-verified) | Yes | No | No | No | Yes | Gracefully returns `[]` if table missing. |
| `reminders/route.ts` | GET, POST | Functional | Yes | No | No | No | Yes | POST never sets `user_id` — every reminder is ownerless. |
| `search/route.ts` | POST | Functional | No | Yes (raw REST, up to 3 collections) | No | No | Yes | Real dual/triple-collection search + real Gemini `generateText` for ask mode. |
| `auth/signup/route.ts` | POST | Functional (see cross-cutting #1) | Yes | No | No | No | Yes | Profile-insert failure only logged. |
| `auth/login/route.ts` | POST | Functional (see cross-cutting #1) | Yes | No | No | No | Yes | Same singleton-client concern. |
| `auth/logout/route.ts` | POST | Functional but likely ineffective | Yes | No | No | No | Yes | Signs out a client with no bound session. |
| `meetings/route.ts` | GET, POST | Functional | Yes | No | No | No | Yes | Clean, item-count enrichment. |
| `rooms/route.ts` | GET, POST | Functional | Yes | No | No | No | Yes | Graceful `[]` fallback. |
| `review/queue/route.ts` | GET | Functional | Yes | No | No | No | Yes | Clean. |
| `risk/radar/route.ts` | GET | Functional | Yes | No | No | No | Yes | Clean. |
| `followups/queue/route.ts` | GET | **Broken (live-confirmed)** | Yes | No | No | No | Yes | Wrong column name `draft` (see cross-cutting #3). |
| `ask/route.ts` | POST | Functional but naive | Yes | **No — no vector search at all** | No (raw `generateText`) | No | Yes | Just grabs the last 40 items by `created_at`. Diverges from `/api/search?mode=ask`, which does real Qdrant retrieval — two inconsistent "ask" implementations exist. |
| `integrations/route.ts` | GET, POST | Functional (live-verified) | Yes | No | No | No | Yes | Graceful missing-table handling. |
| `admin/learning/route.ts` | GET | Functional | Yes | No | No | No | Yes | Clean. |
| `admin/audit-log/route.ts` | GET | Functional (live-verified) | Yes | No | No | No | Yes | Proper pagination. |
| `admin/thresholds/route.ts` | GET | Functional | Yes | No | No | No | Yes | Read-only in this file. |
| `admin/prompts/route.ts` | GET | **Stub** | No | No | No | No | N/A | Returns a hardcoded in-memory array of 5 prompt strings — never reflects edits made via the PUT route. |
| `projects/route.ts` | GET, POST | Functional | Yes | No | No | No | Yes | Clean. |
| `review/route.ts` | POST | Functional | Yes | No | No | No | Yes | accept/edit/discard all write real `audit_logs` rows. |
| `webhooks/external-completion/route.ts` | POST | Functional | Yes | No | No | No | Yes | Real attribution-window + owner-profile update logic. |
| `webhooks/jibri/route.ts` | POST | Functional (partial by design) | Yes | No | No | No | Yes | Creates meeting shell only; transcription needs a follow-up call. |
| `admin/prompts/[agentId]/route.ts` | PUT, POST | Functional but cosmetic | Yes | No | No | No | Yes | Writes real audit rows, but there is no live prompt store the pipeline actually reads — editing has zero runtime effect. |
| `admin/thresholds/[id]/route.ts` | PUT | Functional | Yes | No | No | No | Yes | Real update + audit log. |
| `channels/[id]/messages/route.ts` | GET, POST | Functional | Yes | No | No | No | Yes | Correct cursor pagination. |
| `dms/[userId]/route.ts` | POST | Functional | Yes | No | No | No | Yes | Correct find-or-create logic. |
| `integrations/[id]/route.ts` | DELETE | Functional | Yes | No | No | No | Yes | Simple. |
| `integrations/[id]/mapping/route.ts` | PUT | Functional | Yes | No | No | No | Yes | Simple. |
| `integrations/[id]/test/route.ts` | POST | **Stub (simulation only)** | Yes | No | No | No | Yes | Never calls any real Jira/Asana/Slack API; unconditionally reports `health_status: "ok"`. |
| `items/[id]/route.ts` | GET, PATCH | Functional | Yes | No | No | No | Yes | Correct dependency/contradiction resolution. |
| `items/[id]/complete/route.ts` | POST | Functional | Yes | No | No | No | Yes | Minor: fetches the item twice. |
| `items/[id]/trust/route.ts` | GET | Functional but **misleading** | Yes | No | No | **Fabricated** | Yes | Reverse-engineers a fake `enkrypt_checks` breakdown from the stored `trust_score` number instead of storing/returning the real per-check Enkrypt response. |
| `meetings/[id]/route.ts` | GET, DELETE | Functional | Yes | No | No | No | Yes | Correct cascading delete order. |
| `meetings/[id]/recording/route.ts` | POST | Functional | Yes | No | No (internal HTTP call to `/api/pipeline`) | No | Yes | Convoluted (self-calls `/api/pipeline` then de-dupes) but works. |
| `projects/[id]/route.ts` | GET, PATCH | Functional | Yes | No | No | No | Yes | Clean. |
| `projects/[id]/brief/route.ts` | GET, POST | Functional | Yes | Yes (raw REST) | No (raw `generateText`) | No | Yes | Real Gemini + Qdrant RAG, cached to `project_briefs`. One of the strongest real flows in the app. |
| `projects/[id]/documents/route.ts` | GET, POST | Functional, real bug | Yes | Yes | No | No | Yes | Bucket created `public: false` but code calls `getPublicUrl()` — should use `createSignedUrl()`. Only `.txt`/`.md` get embedded; other formats silently skip. |
| `reminders/[id]/route.ts` | DELETE | Functional | Yes | No | No | No | Yes | Simple. |
| `rooms/[id]/route.ts` | GET, PATCH | Functional | Yes | No | No | No | Yes | Clean. |
| `pipeline/route.ts` | POST | Functional (post-fix) | Yes | Yes (both `@mastra/qdrant` and raw REST) | Yes — `extractionAgent` + `supervisorAgent` (8-tool orchestration) | Yes — injection/adherence/relevancy | Yes | All meetings hardcoded to one `PROJECT_ID` regardless of selected workspace. PII step is 100% local regex mislabeled "Enkrypt Checkpoint 3." "Financial claim" tier is a naive regex, not a real check. `detectContradictionsTool` doesn't filter by `project_id` (masked today by the single hardcoded project). Two 800ms sleeps per item (twice) — real latency risk on longer transcripts. |

## Section 4 — Mastra Backend (`Helm/src/mastra`)

### ⚠️ The central finding: two disconnected Mastra projects

**`Helm/` and `helm-web/` are separate npm packages with no runtime connection.** `helm-web` depends on `@mastra/core`/`@mastra/qdrant` directly — it does not import anything from `Helm/src`. `Helm/` is its own `mastra dev`/`build`/`start` project (Mastra Studio) that nothing in the deployed Next.js app ever calls. `helm-web/app/api/pipeline/route.ts` explicitly says so in its own comment: *"cross-package imports between Mastra backend and Next.js are not supported... Duplicate is intentional."*

The practical effect: **every one of the 5 workflows below is fully built, registered, and dead** as far as the judged app is concerned. The deployed pipeline reimplements a subset of the same logic inline as raw tool-calling `Agent` + `fetch`, with no `createWorkflow`, no suspend/resume, no scorers, no observability wired to the live path. Three divergent copies of the extraction/supervisor prompt now exist (`Helm/src/mastra/agents/extraction-agent.ts`, `Helm/src/mastra/agents/supervisor-agent.ts`, and `helm-web/app/api/pipeline/route.ts`'s inline version) and have drifted from each other.

| File | Exists | Registered in `index.ts`? | gemini-2.5-flash? | Functional or stub? | Notes |
|---|---|---|---|---|---|
| `agents/extraction-agent.ts` | ✅ | Yes | Yes | Functional, **not schema-enforced** — free-text JSON parsed via regex + `JSON.parse`, no `structuredOutput`. Own comment admits this is an unfinished TODO. Has 4 real scorers wired. |
| `agents/ask-agent.ts` | ✅ | Yes | Yes | Functional but **orphaned** — `/api/ask` and `/api/search?mode=ask` reimplement this independently; neither imports it. |
| `agents/brief-agent.ts` | ✅ | Yes | Yes | Functional but **orphaned** — `/api/projects/[id]/brief` reimplements brief generation from scratch. |
| `agents/supervisor-agent.ts` | ✅ | Yes | Yes | Functional, 5 inline tools with real Enkrypt+Qdrant calls — but a **diverged copy** of `pipeline/route.ts`'s 8-tool version (which adds chunking, dependency write-back, 429 backoff, and a 4th trust tier this file lacks). |
| `workflows/risk-monitor.ts` | ✅ | Yes | N/A | Functional, 3 explainable rules incl. silence detection. **Orphaned** — `/api/risk-scan` reimplements a *subset* (missing the silence+deadline rule). |
| `workflows/followup-hitl-workflow.ts` | ✅ | Yes | Yes | Functional — genuinely uses Mastra's `suspend`/`resume` HITL primitive, a real differentiator. **Fully orphaned** — `/api/followup/draft`+`/resolve` implement approval via a plain status column, no suspend/resume at all. This is the single file that would most showcase real Mastra depth, and it never executes in the running app. |
| `workflows/reminder-workflow.ts` | ✅ | Yes | N/A | Functional (Supabase + Slack, 24h dedup). **Orphaned with no substitute** — `/api/reminders` is manual CRUD only; nothing automated runs reminders in the deployed app. |
| `workflows/weekly-report-workflow.ts` | ✅ | Yes | N/A | Functional. **Orphaned** — `/api/reports/weekly/generate` reimplements it (and has its own bug: computes `items_at_risk` but never stores it). |
| `workflows/strategic-insight-workflow.ts` | ✅ | Yes | N/A | Functional (5 concurrent detectors). **Orphaned** — `/api/dashboard/insights` is a near line-for-line duplicate. |
| `tools/pii-redactor.ts` | ✅ | Yes | N/A | Functional local regex, wired into supervisor-agent's real sequence — but **mislabeled**: its own description calls it "Enkrypt Checkpoint 3" despite never calling Enkrypt. |
| `tools/dependency-resolver-tool.ts` | ✅ | Yes | N/A | Functional, real embed+Qdrant search. |
| `tools/enkrypt-check-tool.ts` | ✅ | Yes | N/A | Functional generic wrapper (injection/adherence/relevancy/pii/policy), real calls — but **registered and dead**: supervisor-agent's actual instruction sequence never invokes it, using its own hand-rolled duplicate instead. |
| `tools/qdrant-search-tool.ts` | ✅ | Yes | N/A | Functional, used only by the orphaned ask/brief agents. |
| `tools/qdrant-write-tool.ts` | ✅ | Yes | N/A | Functional but has a **latent bug**: defaults `vector_size = 768` with a comment incorrectly claiming that's gemini-embedding-001's size (it's 3072 everywhere else). Currently dead code, so hasn't fired — but would create a mismatched collection if ever invoked directly. |
| `scorers/extraction-scorer.ts` | ✅ | Yes | N/A | The most legitimate "Mastra depth" artifact in the repo — 4 deterministic scorers, backed by a real eval runner (`Helm/evals/eval-extraction.mjs`) and golden set (`Helm/evals/golden/golden_01_kickoff.json`). But it's a **third copy** of the extraction prompt, and it only ever validates the disconnected Studio copy, never the live pipeline's prompt. |
| `schemas/item.schema.ts` | ✅ | N/A | N/A | Correct Zod schema + a real DFS cycle-detection guard (`findDependencyCycle`) — but **entirely dead code**. Nothing imports it anywhere in either project; every route re-declares its own inline schema, and the cycle guard the file's own comments call mandatory is never invoked. |
| `index.ts` | ✅ | — | N/A | Legitimately deep registration: 5 workflows, 5 agents, 5 tools, 4 scorers, LibSQL+DuckDB storage, Pino logger, full Observability config. Real Mastra-idiomatic setup — disconnected from the deployed app (see above). |

## Section 5 — Database (Supabase)

Live-probed against the connected instance rather than assumed from code:

| Table | Status | Evidence |
|---|---|---|
| `projects`, `users`, `meetings`, `items`, `escalation_logs`, `contradictions` (original 6) | ✅ Confirmed | App is fully functional against these (dashboard, items, review, followups all work live). |
| `rooms`, `channels`, `reminders`, `project_briefs` | ✅ **Confirmed live** | `POST /api/setup-db` → `{"ok":true,"message":"All Helm tables verified."}` |
| `channel_members`, `messages` | ✅ Confirmed live | `GET /api/channels?project_id=...` → `{"channels":[]}` (no relation error) |
| `documents` | ✅ Confirmed live | `GET /api/projects/[id]/documents` → `{"documents":[]}` (no relation error) |
| `integration_configs` | ✅ Confirmed live | `GET /api/integrations?workspace_id=...` → `{"integrations":[]}` (no relation error) |
| `audit_logs` | ✅ Confirmed live | `GET /api/admin/audit-log` → `{"logs":[],"total":0,...}` |
| `reports` | ✅ Confirmed live | `GET /api/reports/weekly?project_id=...` → returns a real report row |
| `pending_syncs`, `owner_profiles`, `adaptive_thresholds` | Not individually curl-verified in this pass | Their API routes read/write these tables with no defensive fallback coded, implying the team expects them to exist; recommend a quick manual spot-check before the demo since `setup-db`'s own POST only verifies 4 of the 12 extended tables. |

**Important:** `POST /api/setup-db` is itself decorative (Section 3) — the tables above exist because someone already pasted the DDL manually into the Supabase SQL editor, not because that endpoint created them. If tables are ever wiped, re-running POST will silently do nothing.

## Section 6 — Qdrant

| Collection | Written by | Read/searched by | Notes |
|---|---|---|---|
| `meeting_items` | `pipeline/route.ts` (real path) + orphaned `Helm/` supervisor-agent | `/api/search`, `/api/dashboard/insights`, `/api/projects/[id]/brief`, orphaned `Helm/` tools | Name sourced consistently via `QDRANT_COLLECTION` env var everywhere it's the primary collection. |
| `transcript_chunks` | Only `pipeline/route.ts` (real, [MM:SS]-aware chunker, 3072-dim) | `/api/search`, `/api/projects/[id]/brief` | **Hardcoded literal** in every call site (not env-sourced like `meeting_items` is) — consistent today because it's the same literal everywhere, but a bad practice. `Helm/` never writes to this collection at all, only references it in searches — so if the Studio agents ever ran standalone, they'd search an empty collection. |
| `documents` | `/api/projects/[id]/documents` (real, `.txt`/`.md` only, 3072-dim) | `/api/search` only | Also hardcoded literal. Non-text uploads (pdf/docx) are stored to Supabase Storage but never embedded — `/search` can never surface their content despite the UI implying generic document upload. `Helm/` never writes here either. |

**Embedding model:** `gemini-embedding-001` used consistently everywhere embeddings are actually generated. **One real inconsistency:** `Helm/src/mastra/tools/qdrant-write-tool.ts` defaults to 768-dim with an incorrect comment — dead code today, latent bug if ever invoked.

## Section 7 — Enkrypt AI Checkpoints

| # | Checkpoint | Real API call? | Branches on result, or logs-and-continues? |
|---|---|---|---|
| 1 | Injection check on raw transcript | **Real** — `pipeline/route.ts` calls `POST /guardrails/detect` (injection_attack). Duplicated (orphaned) in `Helm/`'s supervisor-agent. | **Does not hard-gate in code.** The "stop immediately" instruction is a *prompt* to the LLM orchestrator, not an `if (!safe) return 400` in the route handler. If the LLM ignores the instruction, nothing enforces the halt. |
| 2 | Adherence + hallucination check per item | **Real** — `pipeline/route.ts` calls `/guardrails/adherence` and `/guardrails/relevancy` per item. | **Soft-gates only.** All items (including quarantined ones) are still written to Supabase; enforcement is downstream filtering (search/ask exclude `review_state=quarantined`), not a write-time block. Also: the carefully-researched `Helm/lib/enkrypt.ts` client class (correct field names, wide speaker-labeled context to avoid false rejections) is **never imported anywhere** — every real call site reimplements its own raw `fetch` using a narrower context than that file's own comments say is required. |
| 3 | PII redaction before storage | **Not a real Enkrypt call at all**, in either project — 100% local regex (PAN/card/Aadhaar/email/phone), despite being commented "Enkrypt Checkpoint 3" everywhere. Enkrypt's real `pii` detector exists in `enkrypt-check-tool.ts` but is never called from the actual redaction path. Also runs *after* trust scoring, so un-redacted text hits the adherence/relevancy checks first. | N/A — always runs, always replaces regex matches, but none of it is Enkrypt. |
| 4 | Policy check on follow-up drafts | **Real** — `followup/draft/route.ts` calls `/guardrails/detect` (policy_violation + toxicity). Duplicated (orphaned) in `Helm/`'s followup-hitl-workflow. | **Logs, doesn't block.** `policy_passed` is computed and stored/displayed, but the draft enters `escalation_logs` as `status: "pending"` regardless of pass/fail — a human has to notice the flag themselves. |

**Summary:** all 4 checkpoints have at least one real Enkrypt API call somewhere in the live path — genuinely good coverage breadth. But checkpoint 3 is fake (mislabeled local regex), and checkpoints 1/2/4 compute a real signal without ever hard-gating program flow on it. The project's own PRD explicitly warns: *"A judge from Enkrypt will immediately catch a detector that doesn't exist"* — checkpoint 3 is exactly that risk. Separately, `GET /api/items/[id]/trust` fabricates a fake `enkrypt_checks` breakdown by reverse-engineering pass/fail labels from the stored `trust_score` number rather than returning the real per-check response.

## Section 8 — Environment Variables

`.env.local` defines (all non-empty): `ENKRYPT_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION`, `QDRANT_URL`, `SLACK_WEBHOOK_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

- `GROQ_API_KEY` ✅ present · `SLACK_WEBHOOK_URL` ✅ present · `ENKRYPT_API_KEY` ✅ present · `GOOGLE_GENERATIVE_AI_API_KEY` ✅ present (consumed implicitly by `@ai-sdk/google`, never referenced via `process.env.` directly — expected SDK behavior).
- **Referenced in code, missing from `.env.local`:** `JITSI_DOMAIN` — falls back to `"meet.jit.si"` default, so nothing breaks, but rooms will never use a self-hosted Jitsi instance.
- **Defined but unused:** none — every `.env.local` key is referenced somewhere.
- (Minor formatting-only nit: `GROQ_API_KEY` has a stray space before `=` in `.env.local`; Next's env loader tolerates this, not a functional bug.)

---

## Section 9 — Data Flow Analysis

| # | Flow | Status | Detail |
|---|---|---|---|
| 1 | Upload transcript → pipeline → items on dashboard | **Works** (post-fix) | The `maxSteps`/JSON-parse bugs fixed earlier this session were blocking this entirely; re-verify live end-to-end before relying on it. All meetings land under one hardcoded `PROJECT_ID` — no real multi-project isolation. Extraction output isn't Zod-enforced (regex fence-stripping + `JSON.parse` only). |
| 2 | Search query → Qdrant → results | **Works** on `/search`; **degraded** on dashboard | `/search` correctly forwards `mode`; the dashboard search box omits it, so the AI answer path silently never fires there. |
| 3 | Ask question → cited answer | **Works** via `/search` Ask mode (real Qdrant retrieval + citations) | `/api/ask` is a separate, weaker, naive duplicate (no vector search) not used by the primary Ask UI — redundant/orphaned code, not a functional blocker but worth deleting or fixing. |
| 4 | Risk scan → items flip to at-risk | **Works** | Real, functional, rule-based subset of the fuller orphaned `risk-monitor.ts` logic. One-way ratchet (no reverse transition). |
| 5 | Draft follow-up → approval queue → approve | **Works** | Real end-to-end via the page's direct Supabase queries + `/api/followup/draft`/`resolve`. The documented `GET /api/followups/queue` endpoint is broken but isn't on this path. |
| 6 | Review queue → accept/edit/discard | **Works** | Real, writes `audit_logs`. No error/retry UI on load failure. |
| 7 | Mark item complete | **Works** | Real, straightforward. |
| 8 | Generate project brief | **Works — one of the strongest real flows** | Real Gemini + Qdrant RAG, cached. |
| 9 | Generate weekly report | **Backend works, UI never reaches it** | `/api/reports/weekly/generate` and `GET .../weekly` are both real and live-tested working, but `/reports` page never supplies the required `project_id` and expects the wrong response shape — always shows mock data in the actual app. |
| 10 | Send message in chat channel | **Broken end-to-end** | Chat API routes (`/api/channels`, messages, DMs) are all real and functional, and a real Realtime subscription is wired — but the entire chat UI runs on `mockData.ts` with string IDs that can't match real UUIDs, and the composer never inserts into Supabase. Nothing persists. |

## Section 10 — Mock vs. Real Data (by page)

| Page | Data source | Mock or Real | Notes |
|---|---|---|---|
| `/` Dashboard | Supabase + 4 API routes | Real, but AI-answer & insights sections dead due to 2 param bugs | |
| `/login`, `/signup` | Supabase Auth | Real | signup profile-insert failure silent |
| `/items`, `/items/[id]` | Supabase | Real | state-history timeline fabricated |
| `/decisions` | Supabase | Real | |
| `/meetings`, `/meetings/[id]` | Supabase | Real | |
| `/search` | `/api/search` | Real | mode correctly forwarded |
| `/upload` | `/api/transcribe`, `/api/pipeline` | Real | now fixed, re-verify live |
| `/review` | Supabase + `/api/review` | Real | no error/retry UI |
| `/followups` | Supabase + `/api/followup/resolve` | Real | avoids the broken queue GET |
| `/chat`, `/chat/[channelId]` | `mockData.ts` | **Mock** | composer doesn't persist; realtime wired but nothing to listen to |
| `/calendar` | Supabase | Real | no empty-state icon+message |
| `/workspace/[id]` | Supabase + real brief API | Mostly real | Documents tab hardcoded `[]`, Chat tab placeholder, MemberList unscoped |
| `/team` | Supabase | Real but fragile | name-string owner matching |
| `/reports` | `MOCK_REPORTS` fallback (real API never correctly reached) | **Mock in practice** | |
| `/rooms/new`, `/rooms/[id]` | Supabase + Jitsi | Real | room-name bookkeeping bug |
| `/settings` | Supabase + localStorage | Mostly real | notif prefs local only |
| `/settings/integrations` | Local state | **Mock** | |
| `/settings/intelligence` | Local state | **Mock** | |

## Section 11 — Frontend-Backend Integration Gaps

1. Dashboard search omits `mode` → AI answer card never renders on the dashboard.
2. Dashboard insights omits required `project_id` → always shows the placeholder despite a fully working, live-verified 5-signal engine.
3. `/reports` omits required `project_id` + expects wrong response shape (`{reports:[]}` vs real `{report:{}}`) → always mock.
4. `GET /api/followups/queue` selects a nonexistent column → 500s (live-confirmed); currently unused by the UI but broken as a documented public endpoint.
5. Chat frontend (100% mock) vs. chat backend (100% real and ready) — the biggest single gap in the app; genuinely wired Realtime code has nothing real to listen to.
6. `rooms/new`'s client-generated room name is discarded by `POST /api/rooms`, which mints its own — persisted room ≠ joined room.
7. `/api/ask` (naive) vs `/api/search?mode=ask` (real) — two divergent "ask" implementations; only one is used by the UI.
8. The entire `Helm/src/mastra` project (5 agents, 5 workflows incl. real HITL suspend/resume, 5 tools, 4 scorers) is disconnected from the deployed app, which reimplements a subset inline and has drifted into 3 divergent prompt copies.
9. `Helm/src/mastra/schemas/item.schema.ts`'s Zod schema + cycle-detection guard is imported nowhere; no code path actually runs dependency-cycle validation despite the file calling it mandatory.
10. PII "Enkrypt Checkpoint 3" is pure local regex in both projects — Enkrypt's real PII detector is never called.
11. Checkpoints 1, 2, 4 compute real Enkrypt signals but never hard-gate the actual route handlers on the result.
12. `items/[id]/trust` fabricates a fake per-check breakdown instead of returning the real Enkrypt response.
13. `admin/prompts` writes real audit rows but edits have zero effect on the pipeline's hardcoded prompts — no live prompt store exists.
14. `qdrant-write-tool.ts` (dead code) defaults to a wrong 768-dim vector size.
15. Workspace Documents tab hardcoded to `[]` despite a fully working `/api/projects/[id]/documents`.
16. Workspace `MemberList` shows the entire org, not the project's members (`users` query missing a `project_id` filter).
17. `auth/logout` likely doesn't terminate the real browser session (shared service-role client, no session binding).
18. Settings → Integrations/Intelligence pages are fully disclosed, honest mock shells (matches `DEMO.md`'s own "known mock" list) — lowest-priority gap since it's already flagged to the team.

## Section 12 — Demo Readiness

| Moment | Status |
|---|---|
| 1. Hallucination catch (`transcript_03_demo.txt`) | File exists at `Helm/evals/sampleTranscripts/transcript_03_demo.txt` with a documented fabricated line. Quarantine path (Enkrypt adherence/relevancy → `review_state`) is real. **Should work now** that this session's two pipeline bugs are fixed — but it was broken until minutes ago, so re-run it live before trusting it on stage. |
| 2. "Simulate next day" / risk scan | Real, functional button on the dashboard. ✅ |
| 3. Cross-meeting query with citations | Works on `/search` (real Qdrant + Gemini). **Does not work from the dashboard search box** (missing `mode`) — the demo script says "dashboard search or `/search`"; presenter must use `/search`, not the dashboard box, until Bug 1 in Section 1 is fixed. |
| 4. Approval queue | Real, functional end-to-end (`/followups` + draft/resolve routes). ✅ |
| 5. Trust score badges | Real, visible everywhere, matches design-system tiers. ✅ |
| 6. Pre-recorded backup | `DEMO.md` documents this as a pre-show checklist item but no video file is committed (expected — videos usually aren't). Can't verify from code; confirm directly with whoever is presenting. |

`DEMO.md`'s own "known mock" disclosure list (chat, weekly reports, dashboard insights, integrations, adaptive intelligence) is accurate for chat/integrations/intelligence, but **understates two of them**: weekly reports and dashboard insights both have fully real, working backends now — the gap is purely two small frontend param bugs, not missing backend work. Worth updating that doc once fixed so the team doesn't undersell finished work on stage.

---

## Section 13 — Critical Issues by Severity

### CRITICAL — will visibly fail on the documented demo flow
- Re-verify the upload→pipeline flow live now that `maxSteps`+JSON-parse bugs are fixed — this was completely broken until this session.
- Dashboard AI-answer card never renders (missing `mode`) — the demo script explicitly names the dashboard search box as a valid entry point.
- Dashboard strategic insights always show "No signals yet" (missing `project_id`) — hides a fully-built, live-verified 5-engine feature.
- Chat is 100% non-functional beyond local browser state — any real message sent during a demo vanishes on refresh.
- `/reports` always shows canned mock data (missing `project_id` + shape mismatch) — the real weekly-report + Slack-push engine never surfaces.

### HIGH — judges will likely notice if they poke at it
- `GET /api/followups/queue` 500s on the documented endpoint (wrong column name).
- The entire `Helm/src/mastra` Mastra-Studio project (workflows, HITL suspend/resume, scorers/evals) is disconnected from the deployed app — the 25%-weighted Mastra-depth criterion will be judged on what's actually running unless this is explicitly addressed or demoed separately.
- Enkrypt checkpoints compute real signals but never hard-gate program flow — reduces credit on the trust-layer story even though coverage breadth is real.
- PII "Enkrypt Checkpoint 3" is fake (pure local regex) — the team's own PRD warns a judge from Enkrypt will catch exactly this.
- `rooms/new` bookkeeping bug — persisted room ≠ joined room.
- `items/[id]/trust` fabricates its Enkrypt breakdown instead of returning the real one.

### MEDIUM — works but rough
- Workspace Documents tab hardcoded empty despite a real backend.
- Workspace MemberList not project-scoped.
- `/api/ask` vs `/api/search?mode=ask` duplicate, divergent implementations.
- No error+retry UI on `/review`, `/followups`, `/settings` load failures (silent infinite loading).
- Risk scan one-way ratchet.
- `auth/logout` likely a no-op against the real session.
- Signup silently swallows a `users` insert failure.
- `setup-db` POST doesn't actually run its own DDL (latent footgun if tables are ever recreated — not currently broken since tables already exist).

### LOW — cosmetic / nice-to-have
- `RoomCard.tsx` dead code, never imported.
- Settings Integrations/Intelligence are honest, disclosed mock shells — lowest priority since it's already known.
- Stale in-app copy claiming finished features (brief, review, followup draft, risk-scan) are "pending Member 1."
- Calendar has no empty-state icon+message for zero events.
- `SupersedeChain` shows only a single hop, not a full multi-level chain.
- `AGENTS.md`'s fictional-docs instruction (flagged above) — harmless as read, but odd enough to be worth removing.

---

## Section 14 — Score Estimate

| Criterion | Weight | Estimate | Reasoning |
|---|---|---|---|
| Mastra Integration Depth | 25% | **10/25** | The deployed app only uses the bare `Agent` class as a tool-calling wrapper (real, but shallow) for extraction/supervisor/followup — and even `/api/ask` and `/api/search` bypass `Agent` entirely for raw `generateText`. All the genuinely deep Mastra idioms (4 scheduled workflows, real suspend/resume HITL, 4 scorers + golden eval set, full Observability config) exist and are well-built, but live in the disconnected `Helm/` Studio project that the running app never calls. Judges evaluating the deployed submission will not see any of this unless the team explicitly demos the Studio project alongside it. |
| Qdrant Integration Quality | 20% | **15/20** | 3 real collections, correct 3072-dim `gemini-embedding-001` embeddings throughout, genuine hybrid search with project-scoped filters in most places, real dependency resolution + contradiction detection running live, real cited RAG in Ask mode and project briefs. Deductions: `/api/ask` duplicate skips vector search entirely, `detectContradictionsTool` misses a `project_id` filter (masked today by the single hardcoded project), non-text documents never get embedded. |
| Enkrypt AI Coverage | 20% | **11/20** | All 4 checkpoints have at least one real API call in the live path — good breadth. But checkpoint 3 (PII) is a mislabeled fake, checkpoints 1/2/4 never hard-gate program flow (soft/display-only), and `items/[id]/trust` fabricates output presented as real Enkrypt data. This is exactly the failure mode the team's own PRD flagged as highest-risk with an Enkrypt-affiliated judge in the room. |
| Agent Output Quality | 20% | **12/20** | `extraction-scorer.ts` + the golden eval set + eval runner is a genuinely good artifact — but it only validates the disconnected Studio copy, not the live pipeline's third, divergent, schema-unenforced extraction prompt. Closed-loop eval feedback from review-queue accept/edit/discard isn't implemented (writes `audit_logs` only, doesn't feed back into any eval set). |
| Problem Impact & Novelty | 15% | **10/15** | Genuinely broad, ambitious product surface with several strong, real, end-to-end flows (pipeline, review queue, risk scan, follow-up approval with HITL-style UX, project-brief RAG, org hierarchy, calendar, kanban). But a meaningful chunk of the "chief of staff" pitch (chat, weekly reports, dashboard insights, integrations, adaptive learning) is presentation-only mock in the actual running app, which undercuts the "not just a notetaker" story the moment a judge clicks into those sections. |
| **TOTAL** | | **58/100** | Estimate, not a certainty — the single highest-leverage move to raise this is closing the Mastra Studio ↔ deployed-app gap (Section 4) and hard-gating the Enkrypt checkpoints (Section 7), since those two issues alone are worth roughly 65% of the rubric. |

---

## Section 15 — Recommended Fix List

### 1. Demo-breaking (fix first)
| Fix | File(s) | Effort |
|---|---|---|
| Live-verify the full upload→pipeline→dashboard flow with `transcript_03_demo.txt` now that this session's 2 bugs are fixed | `app/api/pipeline/route.ts` | 30min |
| Pass `mode` (or default to `"ask"`) from the dashboard search box | `app/page.tsx` | 5min |
| Pass a `project_id` to the dashboard insights fetch | `app/page.tsx` | 15min |
| Pass `project_id` to `/reports` and adapt to the real `{report}` shape | `app/reports/page.tsx`, `app/api/reports/weekly/route.ts` | 30min |
| Decide: wire chat to real Supabase, or explicitly skip demoing it live | `app/components/chat/*` | 2hr+ to make real / 5min to just avoid it on stage |

### 2. Rubric-impacting (highest weight first)
| Fix | File(s) | Effort |
|---|---|---|
| Either call `Helm/src/mastra` workflows/agents from `helm-web`, or plan to demo the Mastra Studio project directly alongside the app | `helm-web/app/api/*`, `Helm/src/mastra/index.ts` | 2hr+ |
| Hard-gate Enkrypt checkpoints: abort/quarantine on a failed injection check before extraction runs; block insertion when `policy_passed` is false | `app/api/pipeline/route.ts`, `app/api/followup/draft/route.ts` | 1hr |
| Replace the local-regex PII "checkpoint 3" with a real call to Enkrypt's `pii` detector (the pattern already exists in `enkrypt-check-tool.ts`) | `app/api/pipeline/route.ts` | 1hr |
| Store and return the real Enkrypt per-check breakdown instead of fabricating one from `trust_score` | `app/api/items/[id]/trust/route.ts` | 30min |
| Run `extraction-scorer.ts` + the golden eval set against the live pipeline's actual extraction output (even just as a pre-demo CLI step) | `Helm/evals/eval-extraction.mjs`, `app/api/pipeline/route.ts` | 1hr |

### 3. Integration gaps
| Fix | File(s) | Effort |
|---|---|---|
| Fix the `draft`→`drafted_text` column bug | `app/api/followups/queue/route.ts` | 5min |
| Make `POST /api/rooms` respect the client-sent room name (or have the client use whatever the server returns) | `app/api/rooms/route.ts`, `app/rooms/new/page.tsx` | 30min |
| Consolidate `/api/ask` and `/api/search?mode=ask` into one real, vector-backed implementation | `app/api/ask/route.ts`, `app/api/search/route.ts` | 30min |
| Scope workspace `MemberList` query by `project_id` | `app/components/workspace/MemberList.tsx`, `app/workspace/[id]/page.tsx` | 15min |
| Wire the workspace Documents tab to the real, working documents API | `app/workspace/[id]/page.tsx`, `app/components/workspace/DocumentList.tsx` | 30min |

### 4. Polish
| Fix | File(s) | Effort |
|---|---|---|
| Remove dead `RoomCard.tsx` or wire it into calendar/workspace | `app/components/rooms/RoomCard.tsx` | 15min |
| Update stale "pending Member 1" copy for now-finished features | Various pages | 15min |
| Add error+retry UI to `/review`, `/followups`, `/settings` | Those 3 pages | 30min each |
| Add empty-state icon+message to `/calendar` | `app/calendar/page.tsx` | 15min |
| Fix `auth/logout` to actually terminate the real session | `app/api/auth/logout/route.ts` | 30min |
| Surface signup's silent `users`-insert failure to the user | `app/(auth)/signup/page.tsx` | 15min |
