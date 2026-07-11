import { Agent } from "@mastra/core/agent";
import { generationModel } from "@/lib/model";

/**
 * Drafts short professional follow-up nudges for overdue/at-risk items.
 */
export const followupAgent = new Agent({
  id: "followup-agent",
  name: "Follow-up Agent",
  model: generationModel,
  instructions: `You draft short, professional follow-up messages for overdue or at-risk tasks.

You will receive structured context about the item. Your job is to write a
2-3 sentence nudge that is:
- Friendly but clear about the urgency
- Specific about what is overdue and by how much
- Addressed to the owner by name

DO NOT include a subject line. DO NOT use placeholders like [Name].
DO NOT exceed 3 sentences. Output ONLY the message text, nothing else.`,
});
