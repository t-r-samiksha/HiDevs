import { createWorkflow, createStep } from "@mastra/core/workflows";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";

const ENKRYPT_KEY = process.env.ENKRYPT_API_KEY!;

// ---------------------------------------------------------------------------
// Follow-up Agent — drafts a 2-3 sentence nudge for an overdue task
// ---------------------------------------------------------------------------
export const followupAgent = new Agent({
  id: "followup-agent",
  name: "Follow-up Agent",
  model: "google/gemini-2.5-flash",
  instructions: `You draft short, professional follow-up messages for overdue or at-risk tasks.

You will receive structured context about the item. Your job is to write a
2-3 sentence nudge that is:
- Friendly but clear about the urgency
- Specific about what is overdue and by how much
- Addressed to the owner by name

DO NOT include a subject line. DO NOT use placeholders like [Name].
DO NOT exceed 3 sentences. Output ONLY the message text, nothing else.`,
});

// ---------------------------------------------------------------------------
// Step 1: Draft the nudge using the agent
// ---------------------------------------------------------------------------
const draftNudgeStep = createStep({
  id: "draft-nudge",
  description: "Use the follow-up agent to draft a nudge message",
  inputSchema: z.object({
    item_id: z.string(),
    item_text: z.string(),
    owner: z.string(),
    deadline: z.string(),
    days_overdue: z.number(),
    tier: z.number().default(1),
  }),
  outputSchema: z.object({
    item_id: z.string(),
    item_text: z.string(),
    owner: z.string(),
    draft: z.string(),
    tier: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { item_id, item_text, owner, deadline, days_overdue, tier } = inputData;

    const prompt = `Draft a Tier ${tier} follow-up for this overdue task:
- Task: "${item_text}"
- Owner: ${owner}
- Deadline was: ${deadline}
- Days overdue: ${days_overdue}
${tier === 1 ? "Keep it gentle — this is the first nudge." : "This is an escalation — be firmer."}`;

    const response = await followupAgent.generate([
      { role: "user", content: prompt },
    ]);

    return { item_id, item_text, owner, draft: response.text, tier };
  },
});

// ---------------------------------------------------------------------------
// Step 2: Enkrypt policy + toxicity check on the draft (Checkpoint 4)
// ---------------------------------------------------------------------------
const policyCheckStep = createStep({
  id: "policy-check",
  description: "Run Enkrypt policy/toxicity check on the drafted nudge",
  inputSchema: z.object({
    item_id: z.string(),
    item_text: z.string(),
    owner: z.string(),
    draft: z.string(),
    tier: z.number(),
  }),
  outputSchema: z.object({
    item_id: z.string(),
    item_text: z.string(),
    owner: z.string(),
    draft: z.string(),
    tier: z.number(),
    policy_passed: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const res = await fetch("https://api.enkryptai.com/guardrails/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ENKRYPT_KEY },
      body: JSON.stringify({
        text: inputData.draft,
        detectors: {
          policy_violation: { enabled: true },
          toxicity: { enabled: true },
        },
      }),
    });
    const data = await res.json();
    const policyOk = (data.summary?.policy_violation ?? 0) === 0;
    const toxicityOk = (data.summary?.toxicity ?? 0) === 0;
    return { ...inputData, policy_passed: policyOk && toxicityOk };
  },
});

// ---------------------------------------------------------------------------
// Step 3: Human approval — SUSPEND here (the HITL moment)
// The workflow pauses here until resume() is called with { approved: boolean }
// ---------------------------------------------------------------------------
const humanApprovalStep = createStep({
  id: "human-approval",
  description: "Suspend and wait for human to approve/reject the drafted nudge",
  inputSchema: z.object({
    item_id: z.string(),
    item_text: z.string(),
    owner: z.string(),
    draft: z.string(),
    tier: z.number(),
    policy_passed: z.boolean(),
  }),
  outputSchema: z.object({
    item_id: z.string(),
    owner: z.string(),
    draft: z.string(),
    decision: z.string(),
    sent: z.boolean(),
  }),
  suspendSchema: z.object({
    message: z.string(),
    draft: z.string(),
    owner: z.string(),
    item_text: z.string(),
    policy_passed: z.boolean(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const { item_id, item_text, owner, draft, tier, policy_passed } = inputData;

    // No resume data yet — suspend and surface the approval card to the UI
    if (!resumeData) {
      return suspend({
        message: `Tier ${tier} follow-up drafted for ${owner}. Approve or reject.`,
        draft,
        owner,
        item_text,
        policy_passed,
      });
    }

    // Human responded — execute their decision
    if (resumeData.approved) {
      // In production: send via Slack webhook / email here
      return { item_id, owner, draft, decision: "approved", sent: true };
    }
    return { item_id, owner, draft, decision: "rejected", sent: false };
  },
});

// ---------------------------------------------------------------------------
// The workflow: draft → policy check → human approval (suspend/resume)
// ---------------------------------------------------------------------------
export const followupHitlWorkflow = createWorkflow({
  id: "followup-hitl",
  name: "Follow-up with Human Approval",
  description:
    "Drafts a follow-up nudge for an overdue item, validates it with Enkrypt " +
    "policy + toxicity checks, then suspends for human approval. " +
    "Nothing is sent without a human tap — this is the HITL demonstration.",
  inputSchema: draftNudgeStep.inputSchema,
  outputSchema: humanApprovalStep.outputSchema,
})
  .then(draftNudgeStep)
  .then(policyCheckStep)
  .then(humanApprovalStep);

followupHitlWorkflow.commit();
