import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Agent } from "@mastra/core/agent";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ENKRYPT_KEY = process.env.ENKRYPT_API_KEY!;

const followupAgent = new Agent({
  id: "followup-agent",
  name: "Follow-up Agent",
  model: "google/gemini-2.5-flash",
  instructions: `
You draft short, professional follow-up messages for overdue or at-risk tasks.
Write a 2-3 sentence nudge that is friendly but clear about urgency.
Address the owner by name. Output ONLY the message text, nothing else.
`,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { item_id, tier = 1 } = body;

    if (!item_id) {
      return NextResponse.json({ error: "item_id is required" }, { status: 400 });
    }
    if (![1, 2, 3].includes(tier)) {
      return NextResponse.json({ error: "tier must be 1, 2, or 3" }, { status: 400 });
    }

    const { data: item, error } = await supabase
      .from("items")
      .select("*")
      .eq("id", item_id)
      .single();

    if (error || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // ── Tier 3: flag immediately, no draft ───────────────────────────────────
    if (tier === 3) {
      const { data: log, error: logErr } = await supabase
        .from("escalation_logs")
        .insert({
          item_id: item.id,
          tier: 3,
          drafted_text: null,
          status: "flagged",
          policy_passed: null,
        })
        .select()
        .single();

      if (logErr) throw new Error(logErr.message);

      return NextResponse.json({
        escalation_id: log.id,
        tier: 3,
        needs_attention: true,
        item_text: item.text,
        owner: item.owner,
        message: `"${item.text.slice(0, 80)}" has been flagged as needing immediate attention.`,
      });
    }

    // ── Tier 2: look up manager ───────────────────────────────────────────────
    let managerName: string | null = null;
    if (tier === 2 && item.owner) {
      const { data: ownerUser } = await supabase
        .from("users")
        .select("manager_id, name")
        .eq("id", item.owner)
        .single();

      if (ownerUser?.manager_id) {
        const { data: manager } = await supabase
          .from("users")
          .select("name")
          .eq("id", ownerUser.manager_id)
          .single();
        managerName = manager?.name ?? null;
      }
    }

    // ── Draft via agent ───────────────────────────────────────────────────────
    let prompt: string;
    if (tier === 2) {
      const ccLine = managerName
        ? `Looping in ${managerName} for visibility.`
        : "Escalating for visibility.";
      prompt = `Draft a Tier 2 escalation follow-up for this task:
- Task: "${item.text}"
- Owner: ${item.owner || "the assignee"}
- Deadline: ${item.deadline_raw || "not specified"}
- Status: ${item.status}

Write a firm, professional message in this style:
"Hi ${item.owner || "team"}, this is a follow-up regarding '${item.text.slice(0, 60)}' which was due ${item.deadline_raw || "recently"}. ${ccLine}"

Output ONLY the message text.`;
    } else {
      prompt = `Draft a Tier 1 follow-up for this task:
- Task: "${item.text}"
- Owner: ${item.owner || "the assignee"}
- Deadline: ${item.deadline_raw || "not specified"}
- Status: ${item.status}
Keep it gentle — this is the first nudge.`;
    }

    const response = await followupAgent.generate([{ role: "user", content: prompt }]);
    const draft = response.text;

    // Enkrypt policy check
    const enkryptRes = await fetch("https://api.enkryptai.com/guardrails/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ENKRYPT_KEY },
      body: JSON.stringify({
        text: draft,
        detectors: { policy_violation: { enabled: true }, toxicity: { enabled: true } },
      }),
    });
    const enkryptData = await enkryptRes.json();
    const policyPassed =
      (enkryptData.summary?.policy_violation ?? 0) === 0 &&
      (enkryptData.summary?.toxicity ?? 0) === 0;

    const { data: log, error: logErr } = await supabase
      .from("escalation_logs")
      .insert({
        item_id: item.id,
        tier,
        drafted_text: draft,
        status: "pending",
        policy_passed: policyPassed,
      })
      .select()
      .single();

    if (logErr) throw new Error(logErr.message);

    return NextResponse.json({
      escalation_id: log.id,
      tier,
      draft,
      policy_passed: policyPassed,
      needs_attention: false,
      owner: item.owner,
      item_text: item.text,
      ...(tier === 2 && managerName ? { manager_cc: managerName } : {}),
    });
  } catch (error: any) {
    console.error("Follow-up draft error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
