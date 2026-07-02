import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, role, manager_id } = await req.json();
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "email, password, and name are required" },
        { status: 400 }
      );
    }

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email,
      password,
    });
    if (authErr) throw new Error(authErr.message);

    const userId = authData.user?.id;
    if (userId) {
      const { error: profileErr } = await supabase.from("users").insert({
        id: userId,
        email,
        name,
        role: role || "member",
        manager_id: manager_id || null,
      });
      if (profileErr) console.error("User profile insert:", profileErr.message);
    }

    return NextResponse.json(
      { user: authData.user, session: authData.session },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
