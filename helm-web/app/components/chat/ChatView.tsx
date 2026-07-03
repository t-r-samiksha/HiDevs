"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Hash, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  CURRENT_USER_ID,
  MOCK_CHANNELS,
  MOCK_MESSAGES,
  type Channel,
  type Message,
} from "./mockData";
import ChannelList from "./ChannelList";
import MessageThread from "./MessageThread";
import MessageComposer from "./MessageComposer";

/**
 * Two-panel chat: channel list + active thread + composer.
 * Data is mocked until Member 1 ships the chat tables, but the Supabase
 * Realtime subscription is wired so it starts working the moment INSERTs
 * land on the `messages` table.
 */
export default function ChatView({ initialChannelId }: { initialChannelId?: string }) {
  const router = useRouter();
  const [channels] = useState<Channel[]>(MOCK_CHANNELS);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialChannelId ?? MOCK_CHANNELS[0]?.id ?? null
  );
  // Local message store keyed by channel (seeded from mock).
  const [store, setStore] = useState<Record<string, Message[]>>(MOCK_MESSAGES);

  const selected = channels.find((c) => c.id === selectedId) ?? null;
  const messages = useMemo(
    () => (selectedId ? store[selectedId] ?? [] : []),
    [store, selectedId]
  );

  // Realtime subscription for the active channel. No-op today (table absent),
  // live automatically once Member 1 enables Realtime on `messages`.
  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${selectedId}` },
        (payload) => {
          const m = payload.new as Message;
          setStore((prev) => ({
            ...prev,
            [selectedId]: [...(prev[selectedId] ?? []), m],
          }));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  function selectChannel(id: string) {
    setSelectedId(id);
    // Keep the URL in sync when landing from /chat/[channelId].
    if (initialChannelId) router.replace(`/chat/${id}`);
  }

  function send(text: string) {
    if (!selectedId) return;
    const optimistic: Message = {
      id: `local-${Date.now()}`,
      channel_id: selectedId,
      sender_id: CURRENT_USER_ID,
      sender_name: "You",
      text,
      created_at: new Date().toISOString(),
    };
    setStore((prev) => ({
      ...prev,
      [selectedId]: [...(prev[selectedId] ?? []), optimistic],
    }));
    // TODO: await supabase.from("messages").insert({ channel_id, sender_id, text })
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl gap-4 px-4 py-6 md:px-6">
      {/* Channel list */}
      <aside className="hidden w-60 shrink-0 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-3 md:block">
        <ChannelList channels={channels} selectedId={selectedId} onSelect={selectChannel} />
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
              <span className="ml-2 rounded bg-amber-900/60 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                mock data
              </span>
            </header>
            <MessageThread messages={messages} />
            <MessageComposer onSend={send} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Select a channel to start chatting.
          </div>
        )}
      </section>
    </div>
  );
}
