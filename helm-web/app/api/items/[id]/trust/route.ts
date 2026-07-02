import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/items/[id]/trust
// Returns trust_score, review_state, and reconstructed Enkrypt check breakdown.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { data: item, error } = await supabase
      .from("items")
      .select("id, text, trust_score, review_state, source_quote")
      .eq("id", (await params).id)
      .single();

    if (error || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const ts = item.trust_score ?? 0;

    // Reconstruct Enkrypt signals from the stored trust_score.
    // Pipeline tiers: 0.9 = adherent+relevant, 0.7 = adherent+off-topic,
    //   0.4 = adherent+off-topic+financial_claim, 0.0 = not adherent.
    let enkrypt_checks: Record<string, any>;
    if (ts >= 0.85) {
      enkrypt_checks = { adherence: "pass", relevancy: "pass", financial_claim: false };
    } else if (ts >= 0.6) {
      enkrypt_checks = { adherence: "pass", relevancy: "fail", financial_claim: false };
    } else if (ts > 0) {
      enkrypt_checks = { adherence: "pass", relevancy: "fail", financial_claim: true };
    } else {
      enkrypt_checks = { adherence: "fail", relevancy: "fail", financial_claim: false };
    }

    return NextResponse.json({
      item_id: item.id,
      trust_score: ts,
      review_state: item.review_state,
      enkrypt_checks,
      source_quote: item.source_quote || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
