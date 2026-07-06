"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Hash, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Channel, Message } from "./types";
import ChannelList from "./ChannelList";
import MessageThread from "./MessageThread";
import MessageComposer from "./MessageComposer";

// Single hardcoded project until the pipeline supports real multi-project selection.
const PROJECT_ID = "a1b2c3d4-0000-0000-0000-000000000001";

type DirectoryUser = { id: string; name: string };

/** Two-panel chat: channel list + active thread + composer, backed by real Supabase data. */
export default function ChatView({ initialChannelId }: { initialChannelId?: string }) {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialChannelId ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const selected = channels.find((c) => c.id === selectedId) ?? null;

  const bootstrap = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const [{ data: users }, { data: memberRows }] = await Promise.all([
        supabase.from("users").select("id, name"),
        supabase.from("channel_members").select("channel_id, user_id"),
      ]);
      const directoryUsers = (users as DirectoryUser[]) ?? [];
      setDirectory(directoryUsers);
      const usersById = new Map(directoryUsers.map((u) => [u.id, u.name]));

      const res = await fetch(`/api/channels?project_id=${PROJECT_ID}`);
      const data = await res.json();
      let rawChannels: { id: string; name: string; is_dm: boolean }[] = data.channels ?? [];

      // Auto-create a default "general" channel the first time this project opens chat.
      if (rawChannels.filter((c) => !c.is_dm).length === 0) {
        const createRes = await fetch("/api/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: PROJECT_ID, name: "general" }),
        });
        if (createRes.ok) {
          const created = await createRes.json();
          rawChannels = [...rawChannels, created.channel];
        }
      }

      // Only show DM channels the current user actually belongs to.
      const myChannelIds = new Set(
        (memberRows ?? []).filter((r) => r.user_id === user.id).map((r) => r.channel_id)
      );
      const dmOtherUser = new Map<string, string>();
      for (const row of memberRows ?? []) {
        if (row.user_id !== user.id) dmOtherUser.set(row.channel_id, row.user_id);
      }

      const visible = rawChannels.filter((c) => !c.is_dm || myChannelIds.has(c.id));
      const mapped: Channel[] = visible.map((c) => ({
        id: c.id,
        name: c.is_dm ? usersById.get(dmOtherUser.get(c.id) ?? "") ?? "Direct message" : c.name,
        is_dm: c.is_dm,
        last_message: "",
        unread: 0,
      }));

      setChannels(mapped);
      setSelectedId((prev) => prev ?? initialChannelId ?? mapped[0]?.id ?? null);
    } catch (err) {
      console.error("Chat bootstrap failed:", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChannelId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    bootstrap();
  }, [bootstrap]);

  // Load message history whenever the selected channel changes.
  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      const res = await fetch(`/api/channels/${selectedId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(
        (data.messages ?? []).map((m: { id: string; text: string; created_at: string; sender?: { id: string; name: string } }) => ({
          id: m.id,
          channel_id: selectedId,
          sender_id: m.sender?.id ?? "",
          sender_name: m.sender?.name ?? "Someone",
          text: m.text,
          created_at: m.created_at,
        }))
      );
    })();
  }, [selectedId]);

  // Realtime subscription for the active channel — appends new inserts live.
  useEffect(() => {
    if (!selectedId) return;
    const usersById = new Map(directory.map((u) => [u.id, u.name]));
    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${selectedId}` },
        (payload) => {
          const raw = payload.new as { id: string; channel_id: string; sender_id: string; text: string; created_at: string };
          setMessages((prev) => {
            if (prev.some((m) => m.id === raw.id)) return prev;
            // Reconcile with our own optimistically-appended message, if this is it.
            const optimisticMatch = prev.find(
              (m) => m.id.startsWith("local-") && m.sender_id === raw.sender_id && m.text === raw.text
            );
            if (optimisticMatch) {
              return prev.map((m) =>
                m.id === optimisticMatch.id ? { ...m, id: raw.id, created_at: raw.created_at } : m
              );
            }
            return [
              ...prev,
              {
                id: raw.id,
                channel_id: raw.channel_id,
                sender_id: raw.sender_id,
                sender_name: usersById.get(raw.sender_id) ?? (raw.sender_id === currentUserId ? "You" : "Someone"),
                text: raw.text,
                created_at: raw.created_at,
              },
            ];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId, directory, currentUserId]);

  function selectChannel(id: string) {
    setSelectedId(id);
    if (initialChannelId) router.replace(`/chat/${id}`);
  }

  async function send(text: string) {
    if (!selectedId || !currentUserId) return;
    const optimistic: Message = {
      id: `local-${Date.now()}`,
      channel_id: selectedId,
      sender_id: currentUserId,
      sender_name: "You",
      text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/channels/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender_id: currentUserId, text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Send message failed:", data.error);
      }
    } catch (err) {
      console.error("Send message failed:", err);
    }
  }

  async function createChannel(name: string) {
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: PROJECT_ID, name }),
    });
    if (res.ok) {
      const data = await res.json();
      setChannels((prev) => [
        ...prev,
        { id: data.channel.id, name: data.channel.name, is_dm: false, last_message: "", unread: 0 },
      ]);
      selectChannel(data.channel.id);
    } else {
      const data = await res.json().catch(() => ({}));
      alert("Couldn't create channel: " + (data.error || "unknown error"));
    }
  }

  async function createDM(otherUserId: string, otherUserName: string) {
    if (!currentUserId) return;
    const res = await fetch(`/api/dms/${otherUserId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_user_id: currentUserId, project_id: PROJECT_ID }),
    });
    if (res.ok) {
      const data = await res.json();
      setChannels((prev) => {
        if (prev.some((c) => c.id === data.channel.id)) return prev;
        return [...prev, { id: data.channel.id, name: otherUserName, is_dm: true, last_message: "", unread: 0 }];
      });
      selectChannel(data.channel.id);
    } else {
      const data = await res.json().catch(() => ({}));
      alert("Couldn't start DM: " + (data.error || "unknown error"));
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl px-4 py-6 md:px-6">
        <div className="h-full w-full animate-pulse rounded-2xl bg-slate-900" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl gap-4 px-4 py-6 md:px-6">
      {/* Channel list */}
      <aside className="hidden w-60 shrink-0 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-3 md:block">
        <ChannelList
          channels={channels}
          selectedId={selectedId}
          onSelect={selectChannel}
          directory={directory.filter((u) => u.id !== currentUserId)}
          onCreateChannel={createChannel}
          onCreateDM={createDM}
        />
      </aside>

      {/* Thread */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        {selected ? (
          <>
            <header className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
              <span className="text-slate-500">
                {selected.is_dm ? <User size={16} /> : <Hash size={16} />}
              </span>
              <h2 className="font-medium text-white">{selected.name}</h2>
            </header>
            <MessageThread messages={messages} currentUserId={currentUserId} />
            <MessageComposer onSend={send} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            {channels.length === 0 ? "No channels yet." : "Select a channel to start chatting."}
          </div>
        )}
      </section>
    </div>
  );
}
