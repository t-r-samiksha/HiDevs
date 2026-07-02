"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import WorkspaceHeader from "../../components/workspace/WorkspaceHeader";
import WorkspaceTabs from "../../components/workspace/WorkspaceTabs";
import MemberList, { type Member } from "../../components/workspace/MemberList";
import DocumentList from "../../components/workspace/DocumentList";
import ProjectBriefView from "../../components/workspace/ProjectBriefView";

type Project = { id: string; name: string; description: string | null };
type Meeting = { id: string; title: string; date: string };
type Activity = { id: string; text: string; created_at: string };

const TABS = ["overview", "meetings", "chat", "documents", "brief"];

export default function WorkspacePage() {
  const params = useParams();
  const projectId = params.id as string;

  const [tab, setTab] = useState("overview");
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  async function load() {
    const projRes = await supabase.from("projects").select("id, name, description").eq("id", projectId).single();
    if (projRes.error || !projRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setProject(projRes.data as Project);

    const [usersRes, meetRes, itemsRes] = await Promise.all([
      supabase.from("users").select("id, name, role").order("name"),
      supabase.from("meetings").select("id, title, date").eq("project_id", projectId).order("date", { ascending: false }),
      supabase.from("items").select("id, text, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(8),
    ]);
    setMembers((usersRes.data as Member[]) ?? []);
    setMeetings((meetRes.data as Meeting[]) ?? []);
    setActivity((itemsRes.data as Activity[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function generateBrief() {
    setBriefLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/brief`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBrief(data.brief ?? "No brief returned.");
      } else {
        setBrief(null);
        alert("Brief generation isn't available yet (pending Member 1's brief API).");
      }
    } catch {
      alert("Brief generation isn't available yet (pending Member 1's brief API).");
    } finally {
      setBriefLoading(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-4xl px-4 py-6 md:px-6"><div className="h-64 animate-pulse rounded-2xl bg-slate-900" /></div>;
  }
  if (notFound || !project) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center md:px-6">
        <p className="text-slate-300">Workspace not found.</p>
        <Link href="/" className="mt-3 inline-block text-sm text-blue-400 hover:underline">← Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <WorkspaceHeader name={project.name} description={project.description} memberCount={members.length} meetingCount={meetings.length} />
      <WorkspaceTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-400">Members</h3>
            <MemberList members={members} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-400">Recent activity</h3>
            {activity.length === 0 ? (
              <p className="text-sm text-slate-500">No recent activity.</p>
            ) : (
              <ul className="space-y-2">
                {activity.map((a) => (
                  <li key={a.id} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">
                    {a.text}
                    <span className="ml-2 text-xs text-slate-600">{new Date(a.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "meetings" && (
        <div className="space-y-2">
          {meetings.length === 0 ? (
            <p className="text-sm text-slate-500">No meetings in this project.</p>
          ) : (
            meetings.map((m) => (
              <Link key={m.id} href={`/meetings/${m.id}`} className="block rounded-xl border border-slate-800 bg-slate-900 p-3 hover:border-slate-600">
                <p className="text-sm font-medium text-white">{m.title}</p>
                <p className="text-xs text-slate-400">{new Date(m.date).toLocaleDateString()}</p>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "chat" && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-500">
          Project chat appears here once Member 1&apos;s chat tables are live.{" "}
          <Link href="/chat" className="text-blue-400 hover:underline">Open chat →</Link>
        </div>
      )}

      {tab === "documents" && <DocumentList documents={[]} />}

      {tab === "brief" && (
        <ProjectBriefView brief={brief} loading={briefLoading} onGenerate={generateBrief} />
      )}
    </div>
  );
}
