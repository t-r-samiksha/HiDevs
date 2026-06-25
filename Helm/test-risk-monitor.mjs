// test-risk-monitor.mjs
// ---------------------------------------------------------------------------
// Demo moment: "simulate next day" — watch items flip to at-risk or blocked
// purely from rules, with no one mentioning them.
//
// Run:  node --env-file=.env test-risk-monitor.mjs
// ---------------------------------------------------------------------------

import { Mastra } from "@mastra/core";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const ItemInputSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(["decision", "action_item"]),
  status: z.enum(["open", "in_progress", "at_risk", "blocked", "done"]),
  owner: z.string().optional(),
  deadline_iso: z.string().optional(),
  last_activity_at: z.string().optional(),
  depends_on: z.array(z.string()).default([]),
  trust_score: z.number().min(0).max(1),
});

const WorkflowInputSchema = z.object({
  simulate_date: z.string(),
  items: z.array(ItemInputSchema),
});

const TransitionSchema = z.object({
  item_id: z.string(),
  item_text: z.string(),
  owner: z.string().optional(),
  old_status: z.string(),
  new_status: z.enum(["at_risk", "blocked"]),
  reasons: z.array(z.string()),
});

const WorkflowOutputSchema = z.object({
  evaluated_count: z.number(),
  skipped_low_trust: z.number(),
  skipped_done: z.number(),
  transitions: z.array(TransitionSchema),
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function daysBetween(dateA, dateB) {
  return Math.round((new Date(dateB) - new Date(dateA)) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// The evaluation step — all the rules from PRD Section 16.12
// ---------------------------------------------------------------------------
const evaluateItems = createStep({
  id: "evaluate-items",
  description: "Evaluate open items against risk rules",
  inputSchema: WorkflowInputSchema,
  outputSchema: WorkflowOutputSchema,

  execute: async ({ inputData }) => {
    const today = inputData.simulate_date;
    const allItems = inputData.items;

    const statusMap = new Map();
    for (const it of allItems) statusMap.set(it.id, it.status);

    const transitions = [];
    let skippedLowTrust = 0;
    let skippedDone = 0;
    let evaluated = 0;

    for (const item of allItems) {
      // Skip done items
      if (item.status === "done") { skippedDone++; continue; }
      // Skip decisions (only action_items need tracking)
      if (item.type === "decision") continue;
      // Trust gate: only high-confidence items (doc 16.12)
      if (item.trust_score < 0.85) { skippedLowTrust++; continue; }

      evaluated++;
      const reasons = [];
      let newStatus = null;

      // Rule 1: Dependency blocking (strongest signal)
      const openDeps = item.depends_on.filter((depId) => {
        const s = statusMap.get(depId);
        return s && s !== "done";
      });
      if (openDeps.length > 0) {
        newStatus = "blocked";
        reasons.push(`Blocked by ${openDeps.length} open dependency${openDeps.length > 1 ? "ies" : ""}`);
      }

      // Rule 2: Deadline proximity (dominant factor)
      if (item.deadline_iso) {
        const daysUntil = daysBetween(today, item.deadline_iso);

        if (daysUntil < 0) {
          if (newStatus !== "blocked") newStatus = "at_risk";
          reasons.push(`Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? "s" : ""}`);
        } else if (daysUntil <= 3) {
          if (newStatus !== "blocked") newStatus = "at_risk";
          reasons.push(`Deadline in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`);
        }

        // Rule 3: Silence + approaching deadline together
        if (item.last_activity_at && daysUntil <= 7 && daysUntil > 3) {
          const silentDays = daysBetween(item.last_activity_at, today);
          if (silentDays >= 5) {
            if (newStatus !== "blocked") newStatus = "at_risk";
            reasons.push(`No activity for ${silentDays} days · Deadline in ${daysUntil} days`);
          }
        }
      }

      // Only emit if status actually changes
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
// The workflow
// ---------------------------------------------------------------------------
const riskMonitorWorkflow = createWorkflow({
  id: "risk-monitor",
  name: "Risk Monitor",
  description: "Evaluates open items against deadline, silence, and dependency rules.",
  inputSchema: WorkflowInputSchema,
  outputSchema: WorkflowOutputSchema,
}).then(evaluateItems);

riskMonitorWorkflow.commit();

// ---------------------------------------------------------------------------
// Sample items (mirrors the extraction output from transcripts 1 & 2)
// ---------------------------------------------------------------------------
const items = [
  {
    id: "item_001",
    text: "Rahul will have Postgres set up",
    type: "action_item",
    status: "open",
    owner: "Rahul",
    deadline_iso: "2026-06-28",       // Wednesday June 28
    last_activity_at: "2026-06-25",   // last mentioned in standup
    depends_on: [],
    trust_score: 0.9,
  },
  {
    id: "item_002",
    text: "Sreya will build the dashboard UI shell",
    type: "action_item",
    status: "open",
    owner: "Sreya",
    deadline_iso: "2026-06-27",       // June 27
    last_activity_at: "2026-06-22",   // mentioned in kickoff, nothing since
    depends_on: ["item_001"],         // blocked on Rahul's DB
    trust_score: 0.9,
  },
  {
    id: "item_003",
    text: "Ananya will draft the deployment plan",
    type: "action_item",
    status: "open",
    owner: "Ananya",
    deadline_iso: "2026-07-10",       // "before the demo" — far out
    last_activity_at: "2026-06-22",
    depends_on: [],
    trust_score: 0.9,
  },
  {
    id: "item_004",
    text: "Ananya will handle the API tests",
    type: "action_item",
    status: "open",
    owner: "Ananya",
    deadline_iso: "2026-07-05",
    last_activity_at: "2026-06-22",
    depends_on: [],
    trust_score: 0.5,                 // LOW trust — should be SKIPPED
  },
  {
    id: "item_005",
    text: "Use PostgreSQL (decision)",
    type: "decision",                 // decisions are skipped
    status: "open",
    depends_on: [],
    trust_score: 0.9,
  },
];

// ---------------------------------------------------------------------------
// Simulate three different days to show progression
// ---------------------------------------------------------------------------
const simulations = [
  { date: "2026-06-25", label: "Day 1 — June 25 (today, just after standup)" },
  { date: "2026-06-27", label: "Day 2 — June 27 (Sreya's deadline day)" },
  { date: "2026-06-30", label: "Day 3 — June 30 (Rahul is now overdue)" },
];

console.log("═══════════════════════════════════════════════════════════");
console.log("  HELM RISK MONITOR — simulate next day demo");
console.log("═══════════════════════════════════════════════════════════");

const mastra = new Mastra({ workflows: { riskMonitorWorkflow } });
const workflow = mastra.getWorkflow("riskMonitorWorkflow");

for (const sim of simulations) {
  console.log(`\n━━━ ${sim.label} ━━━`);

  const run = await workflow.createRun();
  const result = await run.start({
    inputData: {
      simulate_date: sim.date,
      items,
    },
  });

  if (result.status === "success") {
    const data = result.result;
    console.log(`  Evaluated: ${data.evaluated_count} items`);
    console.log(`  Skipped (low trust): ${data.skipped_low_trust}`);
    console.log(`  Skipped (done): ${data.skipped_done}`);

    if (data.transitions.length === 0) {
      console.log("  ✅ No state changes — everything looks on track.");
    } else {
      console.log(`  ⚠️  ${data.transitions.length} state change(s):\n`);
      for (const t of data.transitions) {
        console.log(`    📋 "${t.item_text}" (${t.owner || "unassigned"})`);
        console.log(`       ${t.old_status} → ${t.new_status}`);
        for (const r of t.reasons) {
          console.log(`       • ${r}`);
        }
        console.log();
      }
    }
  } else {
    console.log("  ❌ Workflow failed:", JSON.stringify(result, null, 2));
  }
}

console.log("═══════════════════════════════════════════════════════════");
console.log("  If items progressively flipped to at-risk/blocked as");
console.log("  days passed — your risk monitor works. 🎯");
console.log("═══════════════════════════════════════════════════════════");
