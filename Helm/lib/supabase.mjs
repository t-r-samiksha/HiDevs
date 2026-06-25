// lib/supabase.mjs
// ---------------------------------------------------------------------------
// Supabase client for Helm. Uses the service_role key (full DB access) since
// this runs server-side. The anon key is for the frontend later.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
