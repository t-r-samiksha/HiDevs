"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plug, Brain } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Project = { id: string; name: string; description: string | null };
type User = { id: string; name: string; email: string; role: string };

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

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [projRes, usersRes] = await Promise.all([
        supabase.from("projects").select("id, name, description").limit(1),
        supabase.from("users").select("id, name, email, role").order("name"),
      ]);
      if (projRes.error) throw new Error(projRes.error.message);
      if (usersRes.error) throw new Error(usersRes.error.message);
      const proj = (projRes.data as Project[] | null)?.[0] ?? null;
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
  }, []);

  async function saveProject() {
    if (!project) return;
    setSavingProject(true);
    const { error } = await supabase
      .from("projects")
      .update({ name: name.trim(), description: description.trim() || null })
      .eq("id", project.id);
    setSavingProject(false);
    flash(error ? `Error: ${error.message}` : "Project saved");
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

      {/* Project */}
      <Section title="Project">
        {project ? (
          <div className="space-y-3">
            <Labeled label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Labeled>
            <Labeled label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Labeled>
            <button
              onClick={saveProject}
              disabled={savingProject}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingProject ? "Saving…" : "Save project"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No project found.</p>
        )}
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

      {/* Links to sub-pages */}
      <div className="grid gap-3 sm:grid-cols-2">
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
      </div>
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
