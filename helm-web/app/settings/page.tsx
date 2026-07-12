"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plug, Brain } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PROJECT_ID } from "../lib/project";

type Project = { id: string; name: string; description: string | null };
type User = { id: string; name: string; email: string; role: string };
type ServiceHealth = { ok: boolean; detail: string; model?: string; collection?: string };
type Health = { services: Record<string, ServiceHealth> } | null;

const ROLES = ["employee", "manager", "vp"];

export default function SettingsPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [slackUrl, setSlackUrl] = useState("");
  const [emailOn, setEmailOn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [health, setHealth] = useState<Health>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const usersRes = await supabase.from("users").select("id, name, email, role").order("name");
      if (usersRes.error) throw new Error(usersRes.error.message);

      // The `description` column may not exist in this DB yet — fall back to the
      // columns that always exist instead of erroring the whole page.
      let projErr: string | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let projRow: any = null;
      const withDesc = await supabase.from("projects").select("id, name, description").limit(1);
      if (withDesc.error && /description/.test(withDesc.error.message)) {
        const basic = await supabase.from("projects").select("id, name").limit(1);
        projRow = basic.data?.[0] ?? null;
        projErr = basic.error?.message ?? null;
      } else {
        projRow = withDesc.data?.[0] ?? null;
        projErr = withDesc.error?.message ?? null;
      }
      if (projErr) throw new Error(projErr);

      const proj = projRow ? ({ description: null, ...projRow } as Project) : null;
      setProject(proj);
      setName(proj?.name ?? "");
      setDescription(proj?.description ?? "");
      setUsers((usersRes.data as User[]) ?? []);
      // Notification prefs aren't in the schema yet — persist locally for now.
      setSlackUrl(localStorage.getItem("helm.slackUrl") ?? "");
      setEmailOn(localStorage.getItem("helm.emailOn") !== "false");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial data fetch on mount is a legitimate effect use.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    fetch("/api/settings/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
  }, []);

  async function saveProject() {
    if (!project) return;
    setSavingProject(true);
    let { error } = await supabase
      .from("projects")
      .update({ name: name.trim(), description: description.trim() || null })
      .eq("id", project.id);
    // Retry without description if that column hasn't been added to the DB yet.
    if (error && /description/.test(error.message)) {
      ({ error } = await supabase.from("projects").update({ name: name.trim() }).eq("id", project.id));
    }
    setSavingProject(false);
    flash(error ? `Error: ${error.message}` : "Workspace saved");
  }

  async function changeRole(userId: string, role: string) {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    const { error } = await supabase.from("users").update({ role }).eq("id", userId);
    flash(error ? `Error: ${error.message}` : "Role updated");
  }

  async function removeUser(user: User) {
    if (!confirm(`Remove ${user.name} from the workspace?`)) return;
    const { error } = await supabase.from("users").delete().eq("id", user.id);
    if (error) {
      flash(`Could not remove: ${error.message}`);
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    flash("Member removed");
  }

  function saveNotifs() {
    localStorage.setItem("helm.slackUrl", slackUrl);
    localStorage.setItem("helm.emailOn", String(emailOn));
    flash("Notification preferences saved");
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        <div className="h-64 animate-pulse rounded-2xl bg-slate-900" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-16 text-center md:px-6">
        <p className="text-sm text-red-400">{loadError}</p>
        <button
          onClick={load}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <h1 className="mb-6 text-xl font-semibold text-white">Settings</h1>

      {toast && (
        <div className="fixed right-4 top-20 z-50 rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-100 shadow-lg">
          {toast}
        </div>
      )}

      {/* Workspace */}
      <Section title="Workspace">
        <p className="-mt-2 mb-4 text-xs text-slate-500">
          Your team&apos;s workspace — the name and description shown across Helm (reports, briefs, and the meetings that belong to this team).
        </p>
        {project ? (
          <div className="space-y-3">
            <Labeled label="Workspace name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Platform Team"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Labeled>
            <Labeled label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What this team works on — used as context in briefs and reports."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Labeled>
            <button
              onClick={saveProject}
              disabled={savingProject}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingProject ? "Saving…" : "Save workspace"}
            </button>
            <p className="pt-1 font-mono text-xs text-slate-600">
              workspace id: {PROJECT_ID}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No workspace found.</p>
        )}
      </Section>

      {/* System Health */}
      <Section title="System health">
        {!health ? (
          <p className="text-sm text-slate-500">Checking services…</p>
        ) : (
          <div className="space-y-2">
            <HealthRow label="Supabase" s={health.services.supabase} />
            <HealthRow label="Qdrant" s={health.services.qdrant} />
            <HealthRow label="Enkrypt AI" s={health.services.enkrypt} />
            <HealthRow label={`Gemini (${health.services.gemini?.model ?? "—"})`} s={health.services.gemini} />
            <HealthRow label="Groq (Whisper)" s={health.services.groq} />
            <HealthRow label="Slack webhook" s={health.services.slack} />
          </div>
        )}
      </Section>

      {/* Pipeline Configuration (read-only) */}
      <Section title="Pipeline configuration">
        <div className="space-y-2 text-sm text-slate-300">
          <ConfigRow k="Embedding model" v="gemini-embedding-001 (3072d)" />
          <ConfigRow k="Qdrant collections" v="meeting_items, transcript_chunks, documents" />
          <ConfigRow k="Trust thresholds" v=">0.85 auto · 0.60–0.85 review · <0.60 quarantine" />
          <ConfigRow k="Enkrypt checkpoints" v="4 active — injection, adherence, PII, policy" />
          <ConfigRow k="Mastra workflows" v="6 registered" />
          <ConfigRow k="Mastra agents" v="2 registered" />
          <ConfigRow k="Mastra scorers" v="4 registered" />
        </div>
      </Section>

      {/* Team */}
      <Section title="Team members">
        {users.length === 0 ? (
          <p className="text-sm text-slate-500">No members yet.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{u.name}</p>
                  <p className="truncate text-xs text-slate-500">{u.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs capitalize text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeUser(u)}
                    className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-950"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        <div className="space-y-3">
          <Labeled label="Slack webhook URL">
            <input
              value={slackUrl}
              onChange={(e) => setSlackUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Labeled>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={emailOn} onChange={(e) => setEmailOn(e.target.checked)} className="h-4 w-4" />
            Email notifications
          </label>
          <button onClick={saveNotifs} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Save preferences
          </button>
        </div>
      </Section>

      {/* Security & compliance */}
      <Section title="Security & compliance">
        <div className="space-y-2 text-sm text-slate-300">
          <ConfigRow k="Rate limiting" v="60 req/min per IP on pipeline & search endpoints" />
          <ConfigRow k="Transport security" v="All external API calls use HTTPS / TLS 1.3" />
          <ConfigRow k="Encryption at rest" v="Supabase enforces AES-256" />
          <ConfigRow k="PII handling" v="4-checkpoint Enkrypt AI safety layer active" />
          <ConfigRow k="Input validation" v="Zod schema validation + XSS sanitization" />
          <p className="pt-1 text-xs text-slate-600">
            Full report:{" "}
            <a href="/api/compliance/status" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">/api/compliance/status</a>
            {" · "}
            <a href="/api/architecture" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">/api/architecture</a>
          </p>
        </div>
      </Section>

      {/* Links to sub-pages */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/settings/integrations" className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 hover:border-slate-600">
          <Plug className="text-blue-400" size={20} />
          <div>
            <p className="text-sm font-medium text-white">Integrations</p>
            <p className="text-xs text-slate-500">Jira, Asana, Slack, webhooks</p>
          </div>
        </Link>
        <Link href="/settings/intelligence" className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 hover:border-slate-600">
          <Brain className="text-blue-400" size={20} />
          <div>
            <p className="text-sm font-medium text-white">Intelligence</p>
            <p className="text-xs text-slate-500">Adaptive thresholds & prompts</p>
          </div>
        </Link>
        <Link href="/observability" className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 hover:border-slate-600">
          <Plug className="text-blue-400" size={20} />
          <div>
            <p className="text-sm font-medium text-white">Observability</p>
            <p className="text-xs text-slate-500">LLM traces, health, compliance</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />;
}

function HealthRow({ label, s }: { label: string; s?: ServiceHealth }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-slate-200">
        <StatusDot ok={!!s?.ok} />
        {label}
      </span>
      <span className="truncate text-xs text-slate-500">{s?.detail ?? "unknown"}</span>
    </div>
  );
}

function ConfigRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-800/60 pb-1.5">
      <span className="text-xs font-medium text-slate-400">{k}</span>
      <span className="text-right text-sm text-slate-200">{v}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  );
}
