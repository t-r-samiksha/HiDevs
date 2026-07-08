// Real Mastra workflow: query due items → 24h dedup → create reminders → Slack.
// Canonical definition in lib/mastra/workflows/, registered in the instance.
export { reminderWorkflow } from "../mastra/workflows/reminder-workflow";
