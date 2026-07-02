import { createWorkflow, createStep } from "@mastra/core/workflows";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const WorkflowInputSchema = z.object({
  project_id: z.string().optional().describe("If provided, only process items from this project"),
});

const DueItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  owner: z.string().nullable(),
  deadline_raw: z.string().nullable(),
  deadline_iso: z.string().nullable(),
  status: z.string(),
  project_id: z.string().nullable(),
});

const OutputSchema = z.object({
  items_checked: z.number(),
  reminders_sent: z.number(),
  reminders_skipped: z.number(),
});

// ---------------------------------------------------------------------------
// Step 1: Query items due within 2 days that are not done
// ---------------------------------------------------------------------------
const queryDueItemsStep = createStep({
  id: "query-due-items",
  description: "Fetch open items whose deadline falls within the next 2 days",
  inputSchema: WorkflowInputSchema,
  outputSchema: z.object({
    items: z.array(DueItemSchema),
    project_id: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    let query = supabase
      .from("items")
      .select("id, text, owner, deadline_raw, deadline_iso, status, project_id")
      .neq("status", "done")
      .not("deadline_iso", "is", null)
      .gte("deadline_iso", now.toISOString())
      .lte("deadline_iso", cutoff.toISOString());

    if (inputData.project_id) {
      query = query.eq("project_id", inputData.project_id);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { items: data || [], project_id: inputData.project_id };
  },
});

// ---------------------------------------------------------------------------
// Step 2: For each due item, check for recent reminder and send if needed
// ---------------------------------------------------------------------------
const sendRemindersStep = createStep({
  id: "send-reminders",
  description: "Insert reminder rows, send Slack notifications, mark as sent",
  inputSchema: z.object({
    items: z.array(DueItemSchema),
    project_id: z.string().optional(),
  }),
  outputSchema: OutputSchema,
  execute: async ({ inputData }) => {
    const { items } = inputData;
    const slackUrl = process.env.SLACK_WEBHOOK_URL;
    let sent = 0;
    let skipped = 0;

    for (const item of items) {
      // Dedup: skip if already sent a reminder in the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("reminders")
        .select("id")
        .eq("item_id", item.id)
        .eq("sent", true)
        .gte("remind_at", oneDayAgo)
        .limit(1);

      if (recent && recent.length > 0) {
        skipped++;
        continue;
      }

      const deadline = item.deadline_raw || item.deadline_iso || "soon";
      const message = `Reminder: "${item.text}" is due on ${deadline}`;

      const { data: reminder, error: insertErr } = await supabase
        .from("reminders")
        .insert({
          item_id: item.id,
          user_id: null,
          remind_at: new Date().toISOString(),
          message,
          sent: false,
        })
        .select()
        .single();

      if (insertErr || !reminder) {
        console.error(`Failed to insert reminder for ${item.id}:`, insertErr?.message);
        continue;
      }

      if (slackUrl) {
        try {
          await fetch(slackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `:bell: *Helm Reminder* — ${message}${item.owner ? ` (owner: ${item.owner})` : ""}`,
            }),
          });
        } catch (e) {
          console.error("Slack notification failed:", e);
        }
      }

      await supabase
        .from("reminders")
        .update({ sent: true })
        .eq("id", reminder.id);

      sent++;
    }

    return { items_checked: items.length, reminders_sent: sent, reminders_skipped: skipped };
  },
});

export const reminderWorkflow = createWorkflow({
  id: "reminder-workflow",
  name: "Deadline Reminder Workflow",
  description:
    "Scans open items whose deadlines fall within 2 days. For each, checks whether " +
    "a reminder was already sent in the last 24 hours. If not, inserts a reminder row " +
    "and sends a Slack notification (if SLACK_WEBHOOK_URL is configured).",
  inputSchema: WorkflowInputSchema,
  outputSchema: OutputSchema,
})
  .then(queryDueItemsStep)
  .then(sendRemindersStep);

reminderWorkflow.commit();
