import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

/**
 * Helm — Risk Monitor Workflow
 * ----------------------------------------------------------------------------
 * Rule-based, explainable. Not a model. Every flag stores the factors that
 * fired it, rendered on the dashboard card as plain language.
 *
 * From the PRD (Section 16.12), hand-tuned starting thresholds:
 *   - Deadline within 3 days and not Done         → At Risk
 *   - Deadline passed and not Done                → At Risk (overdue)
 *   - No activity for 5+ days AND deadline ≤ 7d   → At Risk (silence)
 *   - Any depends_on item still open              → Blocked
 *
 * Only items with trust_score >= 0.85 are evaluated, so a bad extraction
 * can't generate a false flag.
 *
 * The workflow takes a simulated "current date" so the demo can fast-forward
 * time without waiting for real days to pass. That's the "simulate next day"
 * button from the demo script (PRD Section 14, step 4).
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** Shape of an item coming in (what we'd read from Postgres in the real app). */
const ItemInputSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(["decision", "action_item"]),
  status: z.enum(["open", "in_progress", "at_risk", "blocked", "done"]),
  owner: z.string().optional(),
  deadline_iso: z.string().optional().describe("ISO date string, e.g. 2026-06-27"),
  last_activity_at: z.string().optional().describe("ISO datetime of last status change or mention"),
  depends_on: z.array(z.string()).default([]),
  trust_score: z.number().min(0).max(1),
});

const WorkflowInputSchema = z.object({
  /** The "current" date to evaluate against. ISO string (e.g. "2026-06-30"). */
  simulate_date: z.string().describe("ISO date to treat as 'today' for the evaluation"),
  /** All items in the project (the workflow needs the full set to check dependencies). */
  items: z.array(ItemInputSchema),
});

/** A single state transition produced by the monitor. */
const TransitionSchema = z.object({
  item_id: z.string(),
  item_text: z.string(),
  owner: z.string().optional(),
  old_status: z.string(),
  new_status: z.enum(["at_risk", "blocked"]),
  reasons: z.array(z.string()).describe("Human-readable factors that fired"),
});

const WorkflowOutputSchema = z.object({
  evaluated_count: z.number(),
  skipped_low_trust: z.number(),
  skipped_done: z.number(),
  transitions: z.array(TransitionSchema),
});

// ---------------------------------------------------------------------------
// Helper: days between two ISO date strings
// ---------------------------------------------------------------------------
function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// The single evaluation step
// ---------------------------------------------------------------------------
const evaluateItems = createStep({
  id: "evaluate-items",
  description: "Evaluate all open items against risk rules and produce state transitions",
  inputSchema: WorkflowInputSchema,
  outputSchema: WorkflowOutputSchema,

  execute: async ({ inputData }) => {
    const today = inputData.simulate_date;
    const allItems = inputData.items;

    // Build a quick lookup of item statuses for dependency checks
    const statusMap = new Map<string, string>();
    for (const it of allItems) statusMap.set(it.id, it.status);

    const transitions: z.infer<typeof TransitionSchema>[] = [];
    let skippedLowTrust = 0;
    let skippedDone = 0;
    let evaluated = 0;

    for (const item of allItems) {
      // --- Skip conditions ---
      if (item.status === "done") {
        skippedDone++;
        continue;
      }
      // Only decisions need no action tracking; action_items do
      if (item.type === "decision") continue;

      // Trust gate (doc 16.12): only high-confidence items are evaluated
      if (item.trust_score < 0.85) {
        skippedLowTrust++;
        continue;
      }

      evaluated++;
      const reasons: string[] = [];
      let newStatus: "at_risk" | "blocked" | null = null;

      // --- Rule 1: Dependency blocking ---
      // Any depends_on item that's not "done" → Blocked (strongest signal)
      const openDeps = item.depends_on.filter((depId) => {
        const depStatus = statusMap.get(depId);
        return depStatus && depStatus !== "done";
      });
      if (openDeps.length > 0) {
        newStatus = "blocked";
        reasons.push(
          `Blocked by ${openDeps.length} open dependency${openDeps.length > 1 ? "ies" : ""}`
        );
      }

      // --- Rule 2: Deadline proximity (dominant factor) ---
      if (item.deadline_iso) {
        const daysUntil = daysBetween(today, item.deadline_iso);

        if (daysUntil < 0) {
          // Deadline has passed
          if (!newStatus || newStatus !== "blocked") newStatus = "at_risk";
          reasons.push(`Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? "s" : ""}`);
        } else if (daysUntil <= 3) {
          // Deadline within 3 days
          if (!newStatus || newStatus !== "blocked") newStatus = "at_risk";
          reasons.push(
            `Deadline in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`
          );
        }

        // --- Rule 3: Silence + approaching deadline together ---
        if (item.last_activity_at && daysUntil <= 7 && daysUntil > 3) {
          const silentDays = daysBetween(item.last_activity_at, today);
          if (silentDays >= 5) {
            if (!newStatus || newStatus !== "blocked") newStatus = "at_risk";
            reasons.push(
              `No activity for ${silentDays} days · Deadline in ${daysUntil} days`
            );
          }
        }
      }

      // --- Only emit a transition if status actually changes ---
      if (newStatus && newStatus !== item.status) {
        transitions.push({
          item_id: item.id,
          item_text: item.text,
          owner: item.owner,
          old_status: item.status,
          new_status: newStatus,
          reasons,
        });
      }
    }

    return {
      evaluated_count: evaluated,
      skipped_low_trust: skippedLowTrust,
      skipped_done: skippedDone,
      transitions,
    };
  },
});

// ---------------------------------------------------------------------------
// The workflow itself
// ---------------------------------------------------------------------------
export const riskMonitorWorkflow = createWorkflow({
  id: "risk-monitor",
  name: "Risk Monitor",
  description:
    "Evaluates open action items against deadline, silence, and dependency rules. " +
    "Produces explainable state transitions. Triggered on schedule or via the " +
    "'simulate next day' demo button.",
  inputSchema: WorkflowInputSchema,
  outputSchema: WorkflowOutputSchema,
})
  .then(evaluateItems);

riskMonitorWorkflow.commit();
