/**
 * Reminder workflow. A real scheduled-style Mastra workflow, executed live from
 * POST /api/reminders/trigger: find items with deadlines within 2 days that are
 * still open, dedup against reminders sent in the last 24h, create reminder
 * rows, and push a Slack summary.
 */
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const inputSchema = z.object({ project_id: z.string().optional() });

const DUE_ITEM = z.object({
  id: z.string(),
  text: z.string(),
  owner: z.string().nullable().optional(),
  deadline_iso: z.string(),
});

// Step 1 — find open items whose deadline falls within the next 2 days.
const findDueStep = createStep({
  id: "find-due-items",
  description: "Query open items with a deadline within 2 days",
  inputSchema,
  outputSchema: z.object({ due: z.array(DUE_ITEM) }),
  execute: async ({ inputData }) => {
    const supabase = supa();
    const now = new Date();
    const in2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

    let q = supabase
      .from("items")
      .select("id, text, owner, deadline_iso, project_id, status")
      .in("status", ["open", "in_progress", "at_risk"])
      .not("deadline_iso", "is", null)
      .lte("deadline_iso", in2Days)
      .gte("deadline_iso", now.toISOString());
    if (inputData.project_id) q = q.eq("project_id", inputData.project_id);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const due = (data || []).map((i: { id: string; text: string; owner: string | null; deadline_iso: string }) => ({
      id: i.id,
      text: i.text,
      owner: i.owner,
      deadline_iso: i.deadline_iso,
    }));
    return { due };
  },
});

// Step 2 — dedup against reminders created in the last 24h, then insert + notify.
const createRemindersStep = createStep({
  id: "create-reminders",
  description: "24h-dedup, create reminder rows, and push a Slack summary",
  inputSchema: findDueStep.outputSchema,
  outputSchema: z.object({
    created: z.number(),
    skipped: z.number(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reminders: z.array(z.any()),
  }),
  execute: async ({ inputData }) => {
    const supabase = supa();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created: any[] = [];
    let skipped = 0;

    for (const item of inputData.due) {
      // Dedup: skip if a reminder for this item was created in the last 24h.
      const { data: recent } = await supabase
        .from("reminders")
        .select("id")
        .eq("item_id", item.id)
        .gte("created_at", dayAgo)
        .limit(1);
      if (recent && recent.length > 0) {
        skipped++;
        continue;
      }

      const message = `Reminder: "${item.text.slice(0, 80)}" is due ${new Date(
        item.deadline_iso
      ).toLocaleDateString()}.`;
      const { data, error } = await supabase
        .from("reminders")
        .insert({ item_id: item.id, remind_at: item.deadline_iso, message, sent: false })
        .select()
        .single();
      if (!error && data) created.push(data);
    }

    const slackUrl = process.env.SLACK_WEBHOOK_URL;
    if (slackUrl && created.length > 0) {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `*Helm Reminders* — ${created.length} deadline(s) coming up within 2 days.`,
        }),
      }).catch((e) => console.error("Slack reminder failed:", e));
    }

    return { created: created.length, skipped, reminders: created };
  },
});

export const reminderWorkflow = createWorkflow({
  id: "reminder",
  description:
    "Finds open items with deadlines within 2 days, dedups against the last 24h, creates " +
    "reminder rows and posts a Slack summary.",
  inputSchema,
  outputSchema: createRemindersStep.outputSchema,
})
  .then(findDueStep)
  .then(createRemindersStep);

reminderWorkflow.commit();
