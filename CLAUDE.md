# Helm — Frontend (Member 2: Sreya)

## Project Overview
Helm is a meeting intelligence platform. It processes meeting transcripts, extracts action items and decisions, tracks them with trust scores, and provides AI-powered search, risk scanning, follow-up drafting, and team reporting. This is the Next.js frontend — all backend/agent work is handled by Member 1.

## Project Location
- Path: `C:\Helm - Project\HiDevs`
- Working branch: `sreya-work`
- Always work on `sreya-work`. Do not push to `main` directly.

---

## Tech Stack
- Framework: Next.js (App Router), TypeScript
- Styling: Tailwind CSS, dark theme by default
- Database/Auth: Supabase (client at `@/lib/supabase`), Supabase Auth with `@supabase/ssr`
- Realtime: Supabase Realtime on `messages` and `channels` tables
- Icons: `lucide-react` (16px in sidebar, 20px in cards)
- Charts: `recharts`
- Calendar: `react-big-calendar` with `date-fns` localizer
- Drag-and-drop: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- Video: `@jitsi/react-sdk` for live meeting rooms

## Env Vars (`.env.local`)
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

---

## Architecture Rules
- All pages use the Next.js App Router (`app/` directory)
- Components grouped by feature: `app/components/items/`, `app/components/chat/`, `app/components/calendar/`, etc.
- Shared/reusable components in `app/components/` root (e.g., `TrustScoreBadge.tsx`, `StatusPill.tsx`)
- Auth pages use the `(auth)` route group — must NOT render sidebar/topbar
- Client-side Supabase: use `@/lib/supabase` with anon key
- Server-side API routes: use `SUPABASE_SERVICE_ROLE_KEY`
- Realtime: `supabase.channel().on('postgres_changes', ...).subscribe()`

---

## Design System

### Colors (dark theme)
- Background: `#0f172a`
- Card backgrounds: `#1e293b`
- Primary actions: blue
- Use Tailwind `dark:` prefix throughout

### Status Colors (use consistently everywhere)
- `open` → gray
- `in_progress` → blue
- `at_risk` → amber/yellow
- `blocked` → red
- `done` → green

### Trust Score Colors
- `> 0.85` → green
- `0.60 – 0.85` → amber
- `< 0.60` → red

### UI Conventions
- Typography: Inter or system fonts, consistent heading sizes
- Cards: `rounded-xl` with subtle border, consistent padding
- Status indicators: always use `StatusPill.tsx`
- Trust indicators: always use `TrustScoreBadge.tsx` with color bar
- Icons: `lucide-react` only

### Responsive Rules
- Sidebar collapses to bottom nav on mobile (`< 768px`)
- Cards stack vertically on mobile
- Kanban board scrolls horizontally on mobile
- Chat thread takes full width on mobile (channel list becomes dropdown)
- Calendar defaults to week view on mobile

### Every Page Must Have
- Skeleton loading animation while data fetches
- Empty state with icon + message when no data (e.g., "No meetings yet — upload your first transcript")
- Error state with retry button
- Page metadata: `export const metadata = { title: "Helm | PageName" };`

---

## DO NOT Touch — Already Built & Working
These are complete. Only enhance as specified below, do not rebuild:

- `app/page.tsx` — Dashboard (metrics, search bar, item cards, risk scan button)
- `app/upload/page.tsx` — Upload page (text paste → pipeline)
- `app/meetings/[id]/page.tsx` — Meeting detail (transcript + items side-by-side, mark done)
- `app/followups/page.tsx` — Approval queue (approve/reject drafted follow-ups)
- `app/review/page.tsx` — Review queue (accept/edit/discard low-trust items)
- `lib/supabase.ts` — Supabase client (connected, working)
- `app/api/pipeline/route.ts` — Pipeline API (upload → full pipeline)
- `app/api/search/route.ts` — Search API (basic Qdrant search)
- `app/api/risk-scan/route.ts` — Risk scan API
- `app/api/followup/draft/` + `resolve/` — Follow-up APIs

## DO NOT Touch — Member 1's Territory
All API routes, Mastra agents, workflows, Qdrant pipelines, Enkrypt wiring, and database schema belong to Member 1. Never create or modify:
- Files in `app/api/` unless explicitly requested as a simple UI proxy
- Database schema or migrations
- Agent/workflow code
- Qdrant or Enkrypt configuration

## Mock Data Rule
When a Member 1 API is not yet available, build the page with mock data and add:
`// TODO: Replace mock data with real fetch from /api/endpoint-name`
Never block on missing APIs.

---

## Navigation Structure (Sidebar, in order)
1. Dashboard → `/`
2. Upload → `/upload`
3. Items → `/items`
4. Decisions → `/decisions`
5. Meetings → `/meetings`
6. Chat → `/chat`
7. Calendar → `/calendar`
8. Team → `/team`
9. Reports → `/reports`
10. Search → `/search`
11. Review Queue → `/review`
12. Approval Queue → `/followups`
13. Settings → `/settings`

---

## PHASE 1: Navigation & Layout Overhaul — DO FIRST

### 1.1 Shared Layout with Sidebar
Create: `app/components/Sidebar.tsx` + `app/components/Topbar.tsx`

**Sidebar (desktop — left, 250px wide):**
- Helm logo at top
- Navigation links with `lucide-react` icons for all 13 nav items listed above
- Active link highlighted (check `usePathname()`)
- Unread badges on Chat (query unread message count from Supabase)
- Collapse to icons-only on smaller screens

**Topbar (top, full width):**
- Breadcrumb showing current page name
- Right side: notification bell icon + user avatar
- On mobile: hamburger menu that toggles sidebar

**Update `app/layout.tsx`:** Wrap all pages in the Sidebar + Topbar layout. Auth pages (`/login`, `/signup`) must NOT have the sidebar.

Install: `npm install lucide-react` (if not already installed)

### 1.2 Auth Pages
Create: `app/(auth)/login/page.tsx` + `app/(auth)/signup/page.tsx`

Simple forms using Supabase Auth:
- Login: email + password → `supabase.auth.signInWithPassword()`
- Signup: name, email, password, role dropdown (employee/manager/vp) → `supabase.auth.signUp()` + insert into `users` table
- After login, redirect to `/`
- Wrap the app in an auth guard that redirects unauthenticated users to `/login`

Install: `npm install @supabase/ssr` (for server-side auth helpers)

---

## PHASE 2: Core Pages — The Ones Judges See (Days 1–3)

### 2.1 Improved Dashboard (`/`)
Update: `app/page.tsx`

Additions to the existing working dashboard:
- Sort items by priority: blocked first (red), at_risk (amber), open, in_progress, done last (greyed, strikethrough)
- Strategic signals section below the metrics — show placeholder "No signals yet" until Member 1 provides `/api/dashboard/insights`
- AI answer card: When search returns `{ answer, results }` (after Member 1 finishes ask agent), show the AI answer in a highlighted blue card above raw results
- Voice briefing button: A small speaker icon next to "Today's Briefing" that reads the briefing summary aloud using `window.speechSynthesis` (Web Speech API — free, no API key)
- Approval queue widget: Show count of pending follow-ups as a card linking to `/followups`

### 2.2 Items Page — Kanban Board (`/items`)
Create: `app/items/page.tsx`

Fetch all items from Supabase. Display as kanban board with 5 columns:
- Open | In Progress | At Risk | Blocked | Done
- Each column has item cards draggable between columns
- Drag-and-drop updates `status` in Supabase
- Each card shows: text (truncated), owner, deadline, trust score badge
- Click a card → navigate to `/items/[id]`

Install: `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

Components to create:
- `app/components/items/KanbanBoard.tsx`
- `app/components/items/KanbanColumn.tsx`
- `app/components/items/DraggableItemCard.tsx`

### 2.3 Item Detail Page (`/items/[id]`)
Create: `app/items/[id]/page.tsx`

Shows everything about a single item:
- Full text + type badge (decision / action_item)
- Trust score with color bar (green >0.85, amber 0.60-0.85, red <0.60)
- Owner + deadline
- Source quote (expandable, with meeting title + timestamp link)
- Dependency chips — linked items shown as clickable pills (from `depends_on` UUIDs)
- State history timeline (show status transitions: "Created → At Risk → Done")
- Manual override: edit text, owner, deadline, status inline
- "Mark done" button
- "Draft follow-up" button (calls existing API)
- If decision type: show `supersedes_id` link and contradiction badge if applicable

### 2.4 Decisions Page (`/decisions`)
Create: `app/decisions/page.tsx`

- List all items where `type = 'decision'`
- Show supersede chains visually: if decision B supersedes decision A, draw an arrow or chain linking them with "overrides" label
- Contradiction alert cards at the top (query `contradictions` table)
- Each decision card shows: text, meeting title, date, supersedes_hint if present

### 2.5 Meetings List Page (`/meetings`)
Create: `app/meetings/page.tsx`

- Paginated list of all meetings, newest first
- Each card: title, date, source_type badge (live/upload), item count extracted
- Click → navigate to existing `/meetings/[id]` detail page

Update existing `/meetings/[id]`: Add a "back to all meetings" link at top.

### 2.6 Search Page (`/search`)
Create: `app/search/page.tsx`

A dedicated full-page search experience:
- Large search input at top
- Toggle: "Search" (keyword/semantic) vs "Ask" (AI answer)
- Results show item cards with meeting title, trust score, source quote
- If "Ask" mode and Member 1's ask agent is ready: show AI answer card above results
- Filter sidebar: by project, by date range, by type (decision/action_item)
- "Time travel" mode: search with date range filter

---

## PHASE 3: Communication & Collaboration Pages (Days 3–5)

**Wait for Member 1** to finish chat tables (Phase 3.1) and chat API routes (Phase 3.2) before wiring real data. Build with mock data if not ready.

### 3.1 Chat Hub (`/chat`)
Create: `app/chat/page.tsx`

Left panel: list of channels + DMs for current user (query `channels` joined with `channel_members`). Each shows name, last message preview, unread count. "New channel" button. "New DM" button (shows user picker).

Right panel: loads the selected channel's messages.

### 3.2 Chat Thread (`/chat/[channelId]`)
Create: `app/chat/[channelId]/page.tsx`

Components:
- `app/components/chat/ChannelList.tsx` — sidebar list of channels/DMs
- `app/components/chat/DMList.tsx` — DM conversations
- `app/components/chat/MessageThread.tsx` — scrollable message list, newest at bottom
- `app/components/chat/MessageComposer.tsx` — text input + send button
- `app/components/chat/UnreadBadge.tsx` — red dot with count

Real-time subscription pattern:
```typescript
import { supabase } from "@/lib/supabase";

supabase
  .channel(`messages:${channelId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `channel_id=eq.${channelId}`
  }, (payload) => {
    // Append payload.new to messages state
  })
  .subscribe();
```

### 3.3 Calendar Page (`/calendar`)
Create: `app/calendar/page.tsx`

Install: `npm install react-big-calendar date-fns`

Fetch from two sources:
- `rooms` table → scheduled meetings (blue events)
- `items` table where `deadline_iso IS NOT NULL` → deadlines (red/amber events based on status)

Display in react-big-calendar with month/week toggle. Click a meeting event → go to `/rooms/[id]` or `/meetings/[id]`. Click a deadline → go to `/items/[id]`.

Components:
- `app/components/calendar/CalendarGrid.tsx`
- `app/components/calendar/CalendarEventChip.tsx` — styled differently for rooms vs deadlines
- `app/components/calendar/ReminderBell.tsx` — shows upcoming reminders count
- `app/components/calendar/ReminderCreateModal.tsx` — create manual reminder (POST to `/api/reminders`)

### 3.4 Workspace Hub (`/workspace/[id]`)
Create: `app/workspace/[id]/page.tsx`

The single-page project hub. Tabbed view:
- Overview: project name, member list with role badges, recent activity feed
- Meetings: recent meetings for this project (filtered from meetings table)
- Chat: recent channel messages (filtered by project_id)
- Documents: file list + upload button (Member 1 provides the API)
- Brief: project brief text + "Generate Brief" button (calls Member 1's brief API at `/api/projects/[id]/brief`)

Components:
- `app/components/workspace/WorkspaceHeader.tsx`
- `app/components/workspace/WorkspaceTabs.tsx`
- `app/components/workspace/MemberList.tsx` — user cards with role badges

---

## PHASE 4: Org Hierarchy & Reporting Pages (Days 5–6)

### 4.1 Team Status Page (`/team`)
Create: `app/team/page.tsx`

**For managers:** Query items grouped by owner where owner is a direct report (check `manager_id`). Show a table:

| Team Member | Role | Open | At Risk | Blocked | Done |
|---|---|---|---|---|---|
| Rahul | employee | 2 | 1 | 0 | 3 |
| Sreya | employee | 1 | 0 | 1 | 2 |

Click a row → expand to show that person's items.

**For VPs:** Same table, but aggregated across the full downstream chain (manager's reports + their reports).

Components:
- `app/components/team/TeamStatusTable.tsx`
- `app/components/team/ReporteeRow.tsx` — expandable row with item list

### 4.2 Weekly Reports Page (`/reports`)
Create: `app/reports/page.tsx`

Wait for Member 1's reports API (`GET /api/reports/weekly`).

- List of weekly reports per project, newest first
- Each report card shows: week range, meetings count, tasks completed/pending, major decisions
- Meeting ROI badges (items created per meeting — green for productive, red for low-output)
- Strategic signal cards embedded in report (from Member 1's insights API)
- "Generate Report" button (POST to `/api/reports/weekly/generate`)

Components:
- `app/components/reports/WeeklyReportCard.tsx`
- `app/components/reports/MeetingROIBadge.tsx`
- `app/components/reports/StrategicSignalCard.tsx`

### 4.3 Live Meeting Room (`/rooms/[id]`)
Create: `app/rooms/new/page.tsx` + `app/rooms/[id]/page.tsx`

Install: `npm install @jitsi/react-sdk`

- `/rooms/new` — form: meeting title, select project, schedule time or start immediately. Creates room via Member 1's API (`POST /api/rooms`).
- `/rooms/[id]` — embeds the Jitsi room using `@jitsi/react-sdk`. Shows recording indicator. When meeting ends, redirect to meeting detail page.

Components:
- `app/components/rooms/JitsiRoomEmbed.tsx`
- `app/components/rooms/RoomControls.tsx` — start/end, recording light
- `app/components/rooms/RoomCard.tsx` — compact card for calendar/workspace

Note: Requires Member 1's Jitsi/Jibri Docker setup. If not ready, show placeholder "Live rooms coming soon".

---

## PHASE 5: Settings & Admin Pages (Days 6–7)

### 5.1 Settings Hub (`/settings`)
Create: `app/settings/page.tsx`

- Project name + description (editable)
- Team members list with role management (change role dropdown, remove member)
- Notification preferences (Slack webhook URL, email toggle)

### 5.2 Integration Settings (`/settings/integrations`)
Create: `app/settings/integrations/page.tsx`

Wait for Member 1's integration APIs.

- List connected tools with health status (green/amber/red dot + last sync time)
- "Connect" button for each tool (Jira, Asana, Slack)
- Per-tool type mapping editor: dropdowns mapping Helm types → external types
- "Test with sample item" button
- Disconnect button

Components:
- `app/components/settings/IntegrationHealthRow.tsx`
- `app/components/settings/TypeMappingEditor.tsx`
- `app/components/settings/TestPushButton.tsx`

### 5.3 Intelligence Settings (`/settings/intelligence`)
Create: `app/settings/intelligence/page.tsx`

Wait for Member 1's adaptive learning APIs.

- Learning dashboard: recent adaptive changes with "what changed, why, effect"
- Audit log table (filterable by date, type)
- Threshold controls: sliders for at-risk days, silence days, min/max bounds, adaptation speed toggle (conservative/balanced/aggressive)
- Versioned prompt editor: show agent system prompts, edit, test with sample, restore default

Components:
- `app/components/settings/LearningDashboard.tsx`
- `app/components/settings/AuditLogTable.tsx`
- `app/components/settings/ThresholdControl.tsx`
- `app/components/settings/PromptEditor.tsx`

---

## PHASE 6: Visual Polish & Responsive Design (Days 7–8)

### 6.1 Design System Consistency
Apply consistent styling across ALL pages using the design system defined above.

### 6.2 Responsive Layout
- Sidebar collapses to bottom nav on mobile (<768px)
- Cards stack vertically on mobile
- Kanban board scrolls horizontally on mobile
- Chat thread takes full width on mobile (channel list becomes a dropdown)
- Calendar shows week view by default on mobile (month view too cramped)

### 6.3 Loading States & Empty States
Every page needs skeleton loading, empty state with icon + message, error state with retry button.

### 6.4 Page Metadata
Add proper titles using Next.js metadata to every page:
```typescript
export const metadata = { title: "Helm | Dashboard" };
```

### 6.5 Upload Page Enhancement
- Add drag-and-drop zone for audio files (dashed border area, accepts mp3/wav/m4a/webm)
- Keep the text paste area below it
- Label clearly: "Drop an audio file" vs "Or paste a transcript"
- Progress indicator during transcription + pipeline processing
- Works only after Member 1 finishes audio transcription (Task 1.6)

### 6.6 Dashboard Chart Enhancements
- Recharts line chart showing items created per day (last 7 days)
- Recharts pie chart showing status breakdown
- Install: `npm install recharts` (if not already)

---

## PHASE 7: Demo Preparation (Day 8)

### 7.1 Demo Flow
1. Open `/upload` → paste `transcript_03_demo.txt`
2. Watch pipeline process → navigate to `/review` → fabricated item quarantined
3. Navigate to `/` dashboard → items with trust scores
4. Click "Run risk scan" → items flip to at-risk
5. Search "why did we switch databases?" → AI answer with citations
6. Click "Draft follow-up" on at-risk item → go to `/followups` → approve

### 7.2 Pre-recorded Backup
Screen-record the full demo flow in case wifi fails on stage.

### 7.3 Demo Polish
- Pre-load data: Supabase has clean items from at least 3 meetings
- Set bookmarks: localhost:3000, /upload, /review, /followups
- Test on actual demo device/browser
- Check dark mode works consistently

---

## API Dependencies on Member 1

| You need from Member 1 | What you do after | Their task # |
|---|---|---|
| Search API returns `{ answer, results }` | Show AI answer card above raw results on dashboard + search page | 1.3 |
| Pipeline accepts audio files | Add audio drag-and-drop to upload page | 1.6 |
| Brief API at `/api/projects/[id]/brief` | Build brief view + generate button in workspace hub | 2.1 |
| Reports API at `/api/reports/weekly` | Build `/reports` page with report cards | 2.3 |
| Insights API at `/api/dashboard/insights` | Add InsightCard section to dashboard | 2.4 |
| All new tables created + Realtime enabled | Build chat UI with real-time messages | 3.1 |
| Chat API routes ready | Wire ChannelList, MessageThread, MessageComposer | 3.2 |
| Room API routes ready | Build Jitsi room embed pages | 3.4 |
| Integration APIs ready | Build integration settings page | 3.5 |
| Adaptive learning APIs ready | Build intelligence settings page | 3.6 |

Rule: If Member 1 hasn't finished an API, build the page with mock data and a TODO comment. When the API is ready, swap mock for real fetch. Never block.

---

## Supabase Database Schema Reference (Member 1 owns these — read only)

### Existing tables (6)
- `projects` — id, name, description
- `users` — id, name, email, role (employee/manager/vp), manager_id (FK to users)
- `meetings` — id, project_id, title, date, source_type (live/upload), transcript_text
- `items` — id, meeting_id, project_id, text, type (decision/action_item), status (open/in_progress/at_risk/blocked/done), owner, deadline_iso, trust_score, source_quote, dependency_hints, depends_on (UUID[]), supersedes_id, created_at
- `escalation_logs` — id, item_id, tier, message, created_at
- `contradictions` — id, item_a_id, item_b_id, explanation, created_at

### New tables (Member 1 will create)
- `rooms` — id, project_id, jitsi_room_name, scheduled_time, status (scheduled/live/ended), meeting_id
- `channels` — id, project_id, name, is_dm
- `channel_members` — channel_id, user_id (composite PK)
- `messages` — id, channel_id, sender_id, text, created_at (Realtime enabled)
- `documents` — id, project_id, name, file_url, uploaded_by, uploaded_at
- `reports` — id, project_id, week_start, week_end, meetings_count, tasks_completed, tasks_pending, major_decisions (JSONB), meeting_roi_scores (JSONB)
- `reminders` — id, item_id, user_id, remind_at, message, sent
- `integration_configs` — id, workspace_id, tool (jira/asana/slack/webhook), project_key, type_map (JSONB), priority_map (JSONB), health_status, last_sync_at
- `pending_syncs` — id, integration_id, item_id, action, payload (JSONB), attempts, status
- `owner_profiles` — id, user_id, avg_close_time_tier1, preferred_channel, false_atrisk_rate, needs_tier2_rate
- `audit_logs` — id, change_type, entity, old_value (JSONB), new_value (JSONB), driving_signal, triggered_by
- `adaptive_thresholds` — id, owner_id, item_type, at_risk_days, silence_days, locked

---

## Complete Page Checklist (24 pages)
- [ ] `app/layout.tsx` — update with Sidebar + Topbar
- [ ] `app/page.tsx` — enhance dashboard (sort, insights, voice, charts)
- [ ] `app/(auth)/login/page.tsx`
- [ ] `app/(auth)/signup/page.tsx`
- [ ] `app/items/page.tsx` — kanban board
- [ ] `app/items/[id]/page.tsx` — item detail
- [ ] `app/decisions/page.tsx` — decision log + supersede chains
- [ ] `app/meetings/page.tsx` — meeting list
- [ ] `app/meetings/[id]/page.tsx` — enhance existing (add back link)
- [ ] `app/search/page.tsx` — full search experience
- [ ] `app/upload/page.tsx` — enhance with audio drag-drop
- [ ] `app/review/page.tsx` — enhance existing
- [ ] `app/followups/page.tsx` — enhance existing
- [ ] `app/chat/page.tsx` — chat hub
- [ ] `app/chat/[channelId]/page.tsx` — chat thread
- [ ] `app/calendar/page.tsx`
- [ ] `app/workspace/[id]/page.tsx` — project hub
- [ ] `app/team/page.tsx` — manager/VP view
- [ ] `app/reports/page.tsx`
- [ ] `app/rooms/new/page.tsx`
- [ ] `app/rooms/[id]/page.tsx` — Jitsi embed
- [ ] `app/settings/page.tsx`
- [ ] `app/settings/integrations/page.tsx`
- [ ] `app/settings/intelligence/page.tsx`

## Complete Component Checklist (40+ components)

### Layout
- [ ] `Sidebar.tsx` — nav links, active state, collapse
- [ ] `Topbar.tsx` — breadcrumb, user, notifications
- [ ] `NotificationBell.tsx`

### Items
- [ ] `KanbanBoard.tsx`
- [ ] `KanbanColumn.tsx`
- [ ] `DraggableItemCard.tsx`
- [ ] `TrustScoreBadge.tsx` (shared — used everywhere)
- [ ] `StatusPill.tsx` (shared — used everywhere)
- [ ] `DependencyChips.tsx`

### Decisions
- [ ] `DecisionCard.tsx`
- [ ] `ContradictionAlert.tsx`
- [ ] `SupersedeChain.tsx`

### Search
- [ ] `SearchBar.tsx`
- [ ] `AskBar.tsx`
- [ ] `AnswerCard.tsx` (AI-generated answer with citations)
- [ ] `SemanticResultsList.tsx`

### Chat
- [ ] `ChannelList.tsx`
- [ ] `DMList.tsx`
- [ ] `MessageThread.tsx` (Supabase Realtime subscription)
- [ ] `MessageComposer.tsx`
- [ ] `UnreadBadge.tsx`

### Calendar
- [ ] `CalendarGrid.tsx` (react-big-calendar)
- [ ] `CalendarEventChip.tsx`
- [ ] `ReminderBell.tsx`
- [ ] `ReminderCreateModal.tsx`

### Workspace
- [ ] `WorkspaceHeader.tsx`
- [ ] `WorkspaceTabs.tsx`
- [ ] `MemberList.tsx`

### Meetings
- [ ] `MeetingHistoryList.tsx`
- [ ] `MeetingCard.tsx`

### Team
- [ ] `TeamStatusTable.tsx`
- [ ] `ReporteeRow.tsx`

### Reports
- [ ] `WeeklyReportCard.tsx`
- [ ] `MeetingROIBadge.tsx`
- [ ] `StrategicSignalCard.tsx`

### Rooms
- [ ] `JitsiRoomEmbed.tsx`
- [ ] `RoomControls.tsx`
- [ ] `RoomCard.tsx`

### Dashboard
- [ ] `BriefingDigest.tsx` (with TTS button)
- [ ] `InsightCard.tsx` (one-tap action attached)
- [ ] `ApprovalQueueWidget.tsx`

### Projects
- [ ] `DocumentList.tsx`
- [ ] `DocumentUploadButton.tsx`
- [ ] `ProjectBriefView.tsx`
- [ ] `GenerateBriefButton.tsx`

### Settings
- [ ] `IntegrationHealthRow.tsx`
- [ ] `TypeMappingEditor.tsx`
- [ ] `TestPushButton.tsx`
- [ ] `LearningDashboard.tsx`
- [ ] `AuditLogTable.tsx`
- [ ] `ThresholdControl.tsx`
- [ ] `PromptEditor.tsx`

---

## Git Conventions
- Always work on `sreya-work` branch
- Branch off for features if needed: `feat/sidebar-layout`, `feat/kanban-board`, `fix/mobile-nav`
- Commit messages: `feat: add sidebar navigation`, `fix: kanban drag not updating status`
- Commit after each completed component or page