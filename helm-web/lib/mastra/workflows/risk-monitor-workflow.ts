/**
 * Risk-monitor workflow — rule-based item state machine.
 * Ported to a real Mastra workflow (createWorkflow/createStep) and executed
 * live from POST /api/risk-scan. Adds the silence+deadline rule that the old
 * inline route was missing.
 */
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

const inputSchema = z.object({ simulate_date: z.string().optional() });

// Step 1 — fetch candidate items + a global status map for dependency checks.
const fetchItemsStep = createStep({
  id: "fetch-items",
  description: "Load high-trust, non-done action items and a status lookup",
  inputSchema,
  outputSchema: z.object({
    today: z.string(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: z.array(z.any()),
    statusPairs: z.array(z.tuple([z.string(), z.string()])),
  }),
  execute: async ({ inputData }) => {
    const supabase = supa();
    const today = inputData.simulate_date || new Date().toISOString().split("T")[0];
    const { data: items, error } = await supabase
      .from("items")
      .select("*")
      .eq("type", "action_item")
      .neq("status", "done")
      .gte("trust_score", 0.85);
    if (error) throw new Error(error.message);
    const { data: allItems } = await supabase.from("items").select("id, status");
    const statusPairs = (allItems || []).map((i: { id: string; status: string }) => [i.id, i.status] as [string, string]);
    return { today, items: items || [], statusPairs };
  },
});

// Step 2 — evaluate the risk rules and apply status transitions.
const evaluateStep = createStep({
  id: "evaluate-and-apply",
  description: "Apply dependency / deadline / silence rules and persist transitions",
  inputSchema: fetchItemsStep.outputSchema,
  outputSchema: z.object({
    evaluated: z.number(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transitions: z.array(z.any()),
    simulated_date: z.string(),
  }),
  execute: async ({ inputData }) => {
    const supabase = supa();
    const { today, items, statusPairs } = inputData;
    const statusMap = new Map(statusPairs as [string, string][]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transitions: any[] = [];

    for (const item of items) {
      const reasons: string[] = [];
      let newStatus: string | null = null;

      // Rule 1 — blocked by an open dependency.
      const openDeps = (item.depends_on || []).filter((id: string) => {
        const s = statusMap.get(id);
        return s && s !== "done";
      });
      if (openDeps.length > 0) {
        newStatus = "blocked";
        reasons.push(`Blocked by ${openDeps.length} open dependency`);
      }

      // Rule 2 — deadline proximity / overdue.
      if (item.deadline_iso) {
        const daysUntil = daysBetween(today, item.deadline_iso);
        if (daysUntil < 0) {
          if (newStatus !== "blocked") newStatus = "at_risk";
          reasons.push(`Overdue by ${Math.abs(daysUntil)} days`);
        } else if (daysUntil <= 3) {
          if (newStatus !== "blocked") newStatus = "at_risk";
          reasons.push(`Deadline in ${daysUntil} days`);
        }
      }

      // Rule 3 — silence: no activity for 5+ days AND deadline within 7 days.
      const lastActivity = item.updated_at || item.followup_sent_at || item.created_at;
      if (item.deadline_iso && lastActivity) {
        const daysUntil = daysBetween(today, item.deadline_iso);
        const daysSilent = daysBetween(String(lastActivity).split("T")[0], today);
        if (daysSilent >= 5 && daysUntil >= 0 && daysUntil <= 7) {
          if (newStatus !== "blocked") newStatus = "at_risk";
          reasons.push(`No activity for ${daysSilent} days with deadline in ${daysUntil} days`);
        }
      }

      if (newStatus && newStatus !== item.status) {
        await supabase.from("items").update({ status: newStatus }).eq("id", item.id);
        transitions.push({
          item_id: item.id,
          text: item.text,
          owner: item.owner,
          old_status: item.status,
          new_status: newStatus,
          reasons,
        });
      }
    }

    return { evaluated: items.length, transitions, simulated_date: today };
  },
});

export const riskMonitorWorkflow = createWorkflow({
  id: "risk-monitor",
  description:
    "Evaluates high-trust action items against dependency, deadline, and silence rules and " +
    "transitions them to blocked / at_risk, recording plain-language reasons.",
  inputSchema,
  outputSchema: evaluateStep.outputSchema,
})
  .then(fetchItemsStep)
  .then(evaluateStep);

riskMonitorWorkflow.commit();
