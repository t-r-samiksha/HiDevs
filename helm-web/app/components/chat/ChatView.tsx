"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Hash, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PROJECT_ID } from "../../lib/project";
import type { Channel, Message } from "./types";
import ChannelList from "./ChannelList";
import MessageThread from "./MessageThread";
import MessageComposer from "./MessageComposer";

type ApiChannel = { id: string; name: string; is_dm: boolean };
type ApiMessage = {
  id: string;
  text: string;
  created_at: string;
  sender_id?: string;
  sender?: { id: string; name: string } | null;
};

/**
 * Two-panel chat backed by Member 1's API:
 *   GET  /api/channels?project_id=       → channel list
 *   GET  /api/channels/[id]/messages     → thread
 *   POST /api/channels/[id]/messages     → send
 * Plus a Supabase Realtime subscription for live inserts.
 */
export default function ChatView({ initialChannelId }: { initialChannelId?: string }) {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialChannelId ?? null);
  const [store, setStore] = useState<Record<string, Message[]>>({});
  const [userId, setUserId] = useState<string>("you");
  const [loading, setLoading] = useState(true);
  const seen = useRef<Set<string>>(new Set());

  const selected = channels.find((c) => c.id === selectedId) ?? null;
  const messages = useMemo(() => (selectedId ? store[selectedId] ?? [] : []), [store, selectedId]);

  function mapMessage(m: ApiMessage): Message {
    return {
      id: m.id,
      channel_id: selectedId ?? "",
      sender_id: m.sender?.id ?? m.sender_id ?? "",
      sender_name: m.sender?.name ?? "Member",
      text: m.text,
      created_at: m.created_at,
    };
  }

  // Load current user + channels on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (active && auth.user) setUserId(auth.user.id);
      try {
        const res = await fetch(`/api/channels?project_id=${PROJECT_ID}`);
        const data = await res.json();
        const list: Channel[] = (data.channels ?? []).map((c: ApiChannel) => ({
          id: c.id,
          name: c.name,
          is_dm: c.is_dm,
          last_message: "",
          unread: 0,
        }));
        if (!active) return;
        setChannels(list);
        setSelectedId((prev) => prev ?? list[0]?.id ?? null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Load messages for the active channel + subscribe to inserts.
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/channels/${selectedId}/messages?limit=50`);
        const data = await res.json();
        // API returns newest-first; show oldest-first.
        const msgs: Message[] = (data.messages ?? []).map(mapMessage).reverse();
        if (!active) return;
        msgs.forEach((m) => seen.current.add(m.id));
        setStore((prev) => ({ ...prev, [selectedId]: msgs }));
      } catch {
        /* ignore */
      }
    })();

    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${selectedId}` },
        (payload) => {
          const m = payload.new as { id: string; sender_id: string; text: string; created_at: string };
          if (seen.current.has(m.id)) return;
          seen.current.add(m.id);
          setStore((prev) => ({
            ...prev,
            [selectedId]: [
              ...(prev[selectedId] ?? []),
              { id: m.id, channel_id: selectedId, sender_id: m.sender_id, sender_name: m.sender_id === userId ? "You" : "Member", text: m.text, created_at: m.created_at },
            ],
          }));
        }
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function selectChannel(id: string) {
    setSelectedId(id);
    if (initialChannelId) router.replace(`/chat/${id}`);
  }

  async function send(text: string) {
    if (!selectedId) return;
    const tempId = `local-${Date.now()}`;
    seen.current.add(tempId);
    setStore((prev) => ({
      ...prev,
      [selectedId]: [
        ...(prev[selectedId] ?? []),
        { id: tempId, channel_id: selectedId, sender_id: userId, sender_name: "You", text, created_at: new Date().toISOString() },
      ],
    }));
    try {
      const res = await fetch(`/api/channels/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender_id: userId, text }),
      });
      const data = await res.json();
      if (res.ok && data.message?.id) {
        seen.current.add(data.message.id);
        setStore((prev) => ({
          ...prev,
          [selectedId]: (prev[selectedId] ?? []).map((m) =>
            m.id === tempId ? { ...m, id: data.message.id } : m
          ),
        }));
      }
    } catch {
      /* keep optimistic message */
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl gap-4 px-4 py-6 md:px-6">
      <aside className="hidden w-60 shrink-0 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-3 md:block">
        {loading ? (
          <p className="p-2 text-sm text-slate-500">Loading channels…</p>
        ) : channels.length === 0 ? (
          <p className="p-2 text-sm text-slate-500">No channels yet.</p>
        ) : (
          <ChannelList channels={channels} selectedId={selectedId} onSelect={selectChannel} />
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        {selected ? (
          <>
            <header className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
              <span className="text-slate-500">{selected.is_dm ? <User size={16} /> : <Hash size={16} />}</span>
              <h2 className="font-medium text-white">{selected.name}</h2>
            </header>
            <MessageThread messages={messages} currentUserId={userId} />
            <MessageComposer onSend={send} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            {loading ? "Loading…" : "Select a channel to start chatting."}
          </div>
        )}
      </section>
    </div>
  );
}
