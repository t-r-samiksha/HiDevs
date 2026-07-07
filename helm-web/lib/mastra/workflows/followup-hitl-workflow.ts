/**
 * Follow-up HITL workflow — the human-in-the-loop showcase.
 * Ported from Helm/src/mastra/workflows/followup-hitl-workflow.ts and executed
 * live from the deployed app: POST /api/followup/draft runs it (draft → Enkrypt
 * policy check → suspend), and POST /api/followup/resolve resumes it with the
 * human's approve/reject decision. Nothing is "sent" without a human tap.
 */
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { followupAgent } from "../agents/followup-agent";

const ENKRYPT_KEY = process.env.ENKRYPT_API_KEY!;

// Standalone schemas so downstream steps can `.extend()` them (a step's own
// `.outputSchema` is Mastra-wrapped and not extendable).
const draftInputSchema = z.object({
  item_id: z.string(),
  item_text: z.string(),
  owner: z.string(),
  deadline: z.string(),
  days_overdue: z.number(),
  tier: z.number().default(1),
  manager_cc: z.string().optional(),
});
const draftOutputSchema = z.object({
  item_id: z.string(),
  item_text: z.string(),
  owner: z.string(),
  draft: z.string(),
  tier: z.number(),
});
const policyOutputSchema = draftOutputSchema.extend({ policy_passed: z.boolean() });
const approvalOutputSchema = z.object({
  item_id: z.string(),
  owner: z.string(),
  draft: z.string(),
  decision: z.string(),
  sent: z.boolean(),
});

// Step 1 — draft the nudge with the follow-up agent (real LLM call).
const draftNudgeStep = createStep({
  id: "draft-nudge",
  description: "Use the follow-up agent to draft a nudge message",
  inputSchema: draftInputSchema,
  outputSchema: draftOutputSchema,
  execute: async ({ inputData }) => {
    const { item_id, item_text, owner, deadline, days_overdue, tier, manager_cc } = inputData;
    const prompt = `Draft a Tier ${tier} follow-up for this overdue task:
- Task: "${item_text}"
- Owner: ${owner}
- Deadline was: ${deadline}
- Days overdue: ${days_overdue}
${tier === 1 ? "Keep it gentle — this is the first nudge." : "This is an escalation — be firmer."}${
      manager_cc ? `\n- Loop in ${manager_cc} for visibility.` : ""
    }`;

    const response = await followupAgent.generate([{ role: "user", content: prompt }]);
    return { item_id, item_text, owner, draft: response.text, tier };
  },
});

// Step 2 — Enkrypt policy + toxicity check on the draft (Checkpoint 4).
const policyCheckStep = createStep({
  id: "policy-check",
  description: "Run Enkrypt policy/toxicity check on the drafted nudge",
  inputSchema: draftOutputSchema,
  outputSchema: policyOutputSchema,
  execute: async ({ inputData }) => {
    try {
      const res = await fetch("https://api.enkryptai.com/guardrails/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ENKRYPT_KEY },
        body: JSON.stringify({
          text: inputData.draft,
          detectors: { policy_violation: { enabled: true }, toxicity: { enabled: true } },
        }),
      });
      const data = await res.json();
      const policyOk = (data.summary?.policy_violation ?? 0) === 0;
      const toxicityOk = (data.summary?.toxicity ?? 0) === 0;
      return { ...inputData, policy_passed: policyOk && toxicityOk };
    } catch {
      // If Enkrypt is unreachable, fail closed on policy so a human still reviews.
      return { ...inputData, policy_passed: false };
    }
  },
});

// Step 3 — human approval. SUSPEND here until resume({ approved }).
const humanApprovalStep = createStep({
  id: "human-approval",
  description: "Suspend and wait for a human to approve/reject the drafted nudge",
  inputSchema: policyOutputSchema,
  outputSchema: approvalOutputSchema,
  suspendSchema: z.object({
    message: z.string(),
    draft: z.string(),
    owner: z.string(),
    item_text: z.string(),
    policy_passed: z.boolean(),
  }),
  resumeSchema: z.object({ approved: z.boolean() }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const { item_id, item_text, owner, draft, tier, policy_passed } = inputData;

    if (!resumeData) {
      return suspend({
        message: `Tier ${tier} follow-up drafted for ${owner}. Approve or reject.`,
        draft,
        owner,
        item_text,
        policy_passed,
      });
    }

    if (resumeData.approved) {
      return { item_id, owner, draft, decision: "approved", sent: true };
    }
    return { item_id, owner, draft, decision: "rejected", sent: false };
  },
});

export const followupHitlWorkflow = createWorkflow({
  id: "followup-hitl",
  description:
    "Drafts a follow-up nudge for an overdue item, validates it with Enkrypt policy + " +
    "toxicity checks, then suspends for human approval. Nothing is sent without a human tap.",
  inputSchema: draftInputSchema,
  outputSchema: approvalOutputSchema,
})
  .then(draftNudgeStep)
  .then(policyCheckStep)
  .then(humanApprovalStep);

followupHitlWorkflow.commit();
