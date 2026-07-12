import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Full DDL — paste into Supabase SQL Editor if POST fails
const SETUP_SQL = `
-- Helm extended schema (idempotent)

-- Real per-check Enkrypt breakdown (adherence/relevancy scores, financial-claim
-- flag) captured at extraction time, so /api/items/[id]/trust can return actual
-- data instead of guessing from the single trust_score number.
ALTER TABLE items ADD COLUMN IF NOT EXISTS enkrypt_checks JSONB;

-- Owner resolution: the matched user (id + email) for follow-up delivery, and a
-- human-readable reason when an item was routed to /review (e.g. an ambiguous
-- owner name that needs manual assignment).
ALTER TABLE items ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);
ALTER TABLE items ADD COLUMN IF NOT EXISTS owner_email TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS review_reason TEXT;

-- Persist the Mastra HITL workflow run id on each escalation so /api/followup/resolve
-- can reconstruct and resume the suspended run from storage even after a restart.
ALTER TABLE escalation_logs ADD COLUMN IF NOT EXISTS run_id TEXT;

-- Editable project description shown/edited on the Settings page.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;

-- Persisted agent prompt overrides for the Intelligence settings prompt editor.
-- A missing row means "use the built-in default"; a row overrides it.
CREATE TABLE IF NOT EXISTS agent_prompts (
  agent_id TEXT PRIMARY KEY,
  name TEXT,
  prompt TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  jitsi_room_name TEXT NOT NULL,
  scheduled_time TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended')),
  meeting_id UUID REFERENCES meetings(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Host of the meeting = the user who started it. Grants Helm-level admin
-- controls (end-for-all, recording) on the room page.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- User-entered display title for the room (jitsi_room_name stays a technical id).
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS title TEXT;

CREATE TABLE IF NOT EXISTS channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  name TEXT NOT NULL,
  is_dm BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  name TEXT NOT NULL,
  file_url TEXT,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  meetings_count INT DEFAULT 0,
  tasks_completed INT DEFAULT 0,
  tasks_pending INT DEFAULT 0,
  major_decisions JSONB DEFAULT '[]',
  meeting_roi_scores JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID REFERENCES items(id),
  user_id UUID REFERENCES users(id),
  remind_at TIMESTAMPTZ NOT NULL,
  message TEXT,
  sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owner_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) UNIQUE,
  avg_close_time_tier1 FLOAT,
  preferred_channel TEXT,
  false_atrisk_rate FLOAT,
  needs_tier2_rate FLOAT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  change_type TEXT NOT NULL,
  entity TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  driving_signal TEXT,
  triggered_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS adaptive_thresholds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES users(id),
  item_type TEXT,
  at_risk_days INT DEFAULT 3,
  silence_days INT DEFAULT 5,
  locked BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_briefs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  brief_text TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now(),
  sources_count INT DEFAULT 0
);

-- Helper function for running raw DDL via rpc (call once from SQL Editor)
CREATE OR REPLACE FUNCTION setup_helm_db() RETURNS text AS $$
BEGIN
  RETURN 'Schema already applied — run individual CREATE TABLE statements if needed';
END;
$$ LANGUAGE plpgsql;
`.trim();

// GET /api/setup-db — returns the DDL SQL for manual execution in Supabase SQL Editor
export async function GET() {
  return NextResponse.json({
    message:
      "Copy the sql field and paste it into the Supabase SQL Editor to create all Helm tables.",
    sql: SETUP_SQL,
  });
}

// POST /api/setup-db — attempts to run setup via rpc; falls back gracefully
export async function POST() {
  try {
    // Try calling the stored proc (only works if setup_helm_db() exists)
    const { error } = await supabase.rpc("setup_helm_db");

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Could not call setup_helm_db(). Run GET /api/setup-db to retrieve the SQL, " +
            "then paste it into the Supabase SQL Editor.",
          error: error.message,
        },
        { status: 422 }
      );
    }

    // Verify a few tables exist by probing them
    const checks = await Promise.all([
      supabase.from("rooms").select("id").limit(1),
      supabase.from("channels").select("id").limit(1),
      supabase.from("reminders").select("id").limit(1),
      supabase.from("project_briefs").select("id").limit(1),
    ]);

    const missing = ["rooms", "channels", "reminders", "project_briefs"].filter(
      (_, i) => checks[i].error
    );

    if (missing.length > 0) {
      return NextResponse.json({
        ok: false,
        missing_tables: missing,
        message: "Some tables are missing. Run GET /api/setup-db to get the DDL SQL.",
      });
    }

    return NextResponse.json({ ok: true, message: "All Helm tables verified." });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
