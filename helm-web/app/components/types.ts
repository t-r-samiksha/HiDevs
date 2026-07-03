// Shared shape for a row from the Supabase `items` table.
// Mirrors the columns used across the dashboard, review, and meeting pages.

export type ItemStatus = "open" | "in_progress" | "at_risk" | "blocked" | "done";
export type ItemType = "decision" | "action_item";

export type Item = {
  id: string;
  meeting_id: string;
  project_id: string | null;
  type: ItemType;
  text: string;
  owner: string | null;
  deadline_raw: string | null;
  deadline_iso: string | null;
  status: ItemStatus;
  trust_score: number;
  review_state: string;
  source_quote: string | null;
  source_timestamp: number | null;
  dependency_hints: string[] | null;
  depends_on: string[] | null;
  supersedes_hint: string | null;
  supersedes_id: string | null;
  created_at: string;
};

export type Meeting = {
  id: string;
  title: string;
  date: string;
  source_type: string | null;
  created_at: string;
};

export const KANBAN_COLUMNS: { status: ItemStatus; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "in_progress", label: "In Progress" },
  { status: "at_risk", label: "At Risk" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];
