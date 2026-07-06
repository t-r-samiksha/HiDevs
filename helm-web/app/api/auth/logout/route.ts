import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// NOTE: the web app's own sign-out button (Topbar.tsx) calls
// supabase.auth.signOut() directly on the browser's anon-key client, which is
// the correct way to end that session and already works. This route exists
// as a stateless API surface for non-browser callers — it must NOT use the
// service-role client (signOut() against a session-less service-role client
// is a no-op), so it takes the caller's own session tokens and signs out the
// anon-key client bound to them.
export async function POST(req: NextRequest) {
  try {
    const { access_token, refresh_token } = await req.json().catch(() => ({}));

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    if (access_token && refresh_token) {
      await supabase.auth.setSession({ access_token, refresh_token });
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
