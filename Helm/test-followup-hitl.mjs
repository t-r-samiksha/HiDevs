// test-followup-hitl.mjs
// ---------------------------------------------------------------------------
// The HITL demo: draft a nudge for an overdue item → Enkrypt policy check →
// suspend for human approval → resume and "send" only after approval.
//
// This is the deepest Mastra integration point (suspend/resume) and the piece
// most teams won't attempt. It covers Mastra Depth (25%) directly.
//
// Run:  node --env-file=.env test-followup-hitl.mjs
// ---------------------------------------------------------------------------

import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const ENKRYPT_API_KEY = process.env.ENKRYPT_API_KEY;

// ---------------------------------------------------------------------------
// Follow-up Agent — drafts a 2-3 sentence nudge (PRD Section 16.5)
// ---------------------------------------------------------------------------
const followupAgent = new Agent({
  id: "followup-agent",
  name: "Follow-up Agent",
  model: "google/gemini-2.5-flash",
  instructions: `
You draft short, professional follow-up messages for overdue or at-risk tasks.

You will receive structured context about the item. Your job is to write a
2-3 sentence nudge that is:
- Friendly but clear about the urgency
- Specific about what's overdue and by how much
- Addressed to the owner by name

DO NOT include a subject line. DO NOT use placeholders like [Name].
DO NOT exceed 3 sentences. Output ONLY the message text, nothing else.
`,
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

    return {
      item_id,
      item_text,
      owner,
      draft: response.text,
      tier,
    };
  },
});

// ---------------------------------------------------------------------------
// Step 2: Enkrypt policy check on the draft
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
    const { draft } = inputData;

    // Call Enkrypt policy_violation + toxicity detectors
    const res = await fetch("https://api.enkryptai.com/guardrails/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ENKRYPT_API_KEY },
      body: JSON.stringify({
        text: draft,
        detectors: {
          policy_violation: { enabled: true },
          toxicity: { enabled: true },
        },
      }),
    });
    const data = await res.json();

    const policyOk = (data.summary?.policy_violation ?? 0) === 0;
    const toxicityOk = (data.summary?.toxicity ?? 0) === 0;
    const policy_passed = policyOk && toxicityOk;

    return { ...inputData, policy_passed };
  },
});

// ---------------------------------------------------------------------------
// Step 3: Human approval — SUSPEND here (the HITL moment)
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

    // If no approval data yet, SUSPEND and wait for human
    if (!resumeData) {
      return suspend({
        message: `Tier ${tier} follow-up drafted for ${owner}. Approve or reject.`,
        draft,
        owner,
        item_text,
        policy_passed,
      });
    }

    // Human has responded — check their decision
    if (resumeData.approved) {
      // In the real app: send via Slack webhook / email here
      console.log(`   📤 SENT to ${owner}: "${draft}"`);
      return {
        item_id,
        owner,
        draft,
        decision: "approved",
        sent: true,
      };
    } else {
      console.log(`   ❌ REJECTED — draft not sent.`);
      return {
        item_id,
        owner,
        draft,
        decision: "rejected",
        sent: false,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// The workflow: draft → policy check → human approval
// ---------------------------------------------------------------------------
const followupWorkflow = createWorkflow({
  id: "followup-hitl",
  name: "Follow-up with Human Approval",
  description:
    "Drafts a follow-up nudge, validates it with Enkrypt, then suspends " +
    "for human approval. Nothing sends without a tap.",
  inputSchema: draftNudgeStep.inputSchema,
  outputSchema: humanApprovalStep.outputSchema,
})
  .then(draftNudgeStep)
  .then(policyCheckStep)
  .then(humanApprovalStep);

followupWorkflow.commit();

// ---------------------------------------------------------------------------
// Run the demo
// ---------------------------------------------------------------------------
console.log("═══════════════════════════════════════════════════════════");
console.log("  HELM FOLLOW-UP AGENT — HITL suspend/resume demo");
console.log("═══════════════════════════════════════════════════════════\n");

const mastra = new Mastra({
  agents: { followupAgent },
  workflows: { followupWorkflow },
});

const workflow = mastra.getWorkflow("followupWorkflow");
const run = await workflow.createRun();

// Start the workflow with Rahul's overdue item
console.log("🚀 Starting follow-up workflow for Rahul's overdue task...\n");

const result = await run.start({
  inputData: {
    item_id: "item_001",
    item_text: "Set up the Postgres database",
    owner: "Rahul",
    deadline: "2026-06-28",
    days_overdue: 2,
    tier: 1,
  },
});

// The workflow should now be SUSPENDED at the human-approval step
if (result.status === "suspended") {
  console.log("✅ Workflow SUSPENDED — waiting for human approval.\n");

  // Show what the human would see in the approval queue
  const suspendedSteps = result.suspended;
  const stepData = result.steps?.["human-approval"]?.suspendPayload;

  console.log("━━━ APPROVAL QUEUE CARD ━━━");
  if (stepData) {
    console.log(`  📋 Task: "${stepData.item_text}"`);
    console.log(`  👤 To: ${stepData.owner}`);
    console.log(`  🛡️  Policy check: ${stepData.policy_passed ? "✅ passed" : "⚠️ flagged"}`);
    console.log(`  ✉️  Draft:`);
    console.log(`     "${stepData.draft}"`);
  } else {
    // Fallback: show raw suspended info
    console.log("  Suspended steps:", JSON.stringify(suspendedSteps, null, 2));
    console.log("  Steps data:", JSON.stringify(result.steps, null, 2));
  }
  console.log(`  [✅ Approve]  [❌ Reject]\n`);

  // Simulate human tapping "Approve"
  console.log("👆 Human taps APPROVE...\n");

  const finalResult = await run.resume({
    step: "human-approval",
    resumeData: { approved: true },
  });

  if (finalResult.status === "success") {
    console.log("\n✅ Workflow COMPLETED.");
    console.log("   Result:", JSON.stringify(finalResult.result, null, 2));
  } else {
    console.log("\n⚠️  Final status:", finalResult.status);
    console.log("   Details:", JSON.stringify(finalResult, null, 2));
  }
} else {
  console.log("⚠️  Expected 'suspended' but got:", result.status);
  console.log("   Details:", JSON.stringify(result, null, 2));
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  If the workflow suspended with a draft, then resumed");
console.log("  and sent only after approval — HITL works. 🎯");
console.log("═══════════════════════════════════════════════════════════");
