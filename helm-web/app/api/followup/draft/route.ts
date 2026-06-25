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
    const { item_id } = await req.json();

    // Fetch the item
    const { data: item, error } = await supabase
      .from("items")
      .select("*")
      .eq("id", item_id)
      .single();

    if (error || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Draft the nudge
    const prompt = `Draft a Tier 1 follow-up for this task:
- Task: "${item.text}"
- Owner: ${item.owner || "the assignee"}
- Deadline: ${item.deadline_raw || "not specified"}
- Status: ${item.status}
Keep it gentle — this is the first nudge.`;

    const response = await followupAgent.generate([
      { role: "user", content: prompt },
    ]);

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

    // Store in escalation_logs
    const { data: log, error: logErr } = await supabase
      .from("escalation_logs")
      .insert({
        item_id: item.id,
        tier: 1,
        drafted_text: draft,
        status: "pending",
        policy_passed: policyPassed,
      })
      .select()
      .single();

    if (logErr) throw new Error(logErr.message);

    return NextResponse.json({
      escalation_id: log.id,
      draft,
      policy_passed: policyPassed,
      owner: item.owner,
      item_text: item.text,
    });
  } catch (error: any) {
    console.error("Follow-up draft error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
