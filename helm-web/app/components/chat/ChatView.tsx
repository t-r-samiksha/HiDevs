"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Hash, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Channel, Message } from "./types";
import ChannelList from "./ChannelList";
import MessageThread from "./MessageThread";
import MessageComposer from "./MessageComposer";
import ChannelMembersButton from "./ChannelMembersButton";
import { CHAT_PROJECT_ID as PROJECT_ID, getLastRead, setLastRead } from "./unread";

type DirectoryUser = { id: string; name: string; email?: string; role?: string };

/** Two-panel chat: channel list + active thread + composer, backed by real Supabase data. */
export default function ChatView({ initialChannelId }: { initialChannelId?: string }) {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialChannelId ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channelMembers, setChannelMembers] = useState<Map<string, string[]>>(new Map());
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const didBootstrapRef = useRef(false);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const selected = channels.find((c) => c.id === selectedId) ?? null;
  const isManager = directory.find((u) => u.id === currentUserId)?.role === "manager";

  // Explicit channel_members rows if any were recorded; otherwise a channel
  // (unlike a DM) is a shared, project-wide space, so treat everyone as a member.
  const memberNames = selected
    ? (channelMembers.get(selected.id)?.length
        ? channelMembers.get(selected.id)!
        : directory.map((u) => u.id)
      ).map((id) => directory.find((u) => u.id === id)?.name ?? "Unknown")
    : [];

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const bootstrap = useCallback(async () => {
    setError(null);
    try {
      // Reuse the session AppShell already validated instead of re-checking
      // over the network with getUser() — that extra round-trip can fail
      // (stale token, slow network) even while the rest of the app still
      // looks signed in, which used to leave chat silently empty.
      let { data: { session } } = await supabase.auth.getSession();

      // getSession() returns whatever's cached in local storage as-is — if the
      // access token already expired (e.g. the tab sat open a while), it does
      // NOT refresh it, so any direct supabase.from(...) query below would
      // fail with "JWT expired" even though the rest of the app still looks
      // signed in (routes going through /api/* use the service-role key and
      // are unaffected, which is why channels loaded but users/members didn't).
      const expiresAtMs = (session?.expires_at ?? 0) * 1000;
      if (session && expiresAtMs <= Date.now()) {
        const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr || !refreshed.session) {
          setError("Your session expired — please sign in again.");
          return;
        }
        session = refreshed.session;
      }

      const user = session?.user;
      if (!user) {
        setError("You're not signed in — please sign in again to use chat.");
        return;
      }
      setCurrentUserId(user.id);

      const [
        { data: users, error: usersError },
        { data: memberRows, error: memberError },
      ] = await Promise.all([
        supabase.from("users").select("id, name, email, role"),
        supabase.from("channel_members").select("channel_id, user_id"),
      ]);
      if (usersError) console.error("Failed to load users directory:", usersError);
      if (memberError) console.error("Failed to load channel_members:", memberError);
      if (usersError?.code === "PGRST303" || memberError?.code === "PGRST303") {
        setError("Your session expired — please refresh the page or sign in again.");
        return;
      }
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

      const membersByChannel = new Map<string, string[]>();
      for (const row of memberRows ?? []) {
        membersByChannel.set(row.channel_id, [...(membersByChannel.get(row.channel_id) ?? []), row.user_id]);
      }
      setChannelMembers(membersByChannel);

      // A channel with no recorded members is a legacy/open channel visible to
      // everyone in the project; one created with specific members is private
      // to them. DMs are always membership-gated.
      const visible = rawChannels.filter((c) => {
        if (c.is_dm) return myChannelIds.has(c.id);
        const members = membersByChannel.get(c.id) ?? [];
        return members.length === 0 || myChannelIds.has(c.id);
      });
      const mapped: Channel[] = visible.map((c) => ({
        id: c.id,
        name: c.is_dm ? usersById.get(dmOtherUser.get(c.id) ?? "") ?? "Direct message" : c.name,
        is_dm: c.is_dm,
        last_message: "",
        unread: 0,
      }));

      // Unread = messages from other people newer than this channel's last-read mark.
      // Track each channel's latest other-sent message too, so marking the
      // initial channel "read" can use a server timestamp instead of the
      // client clock (comparing a client Date() against Postgres-generated
      // created_at values is fragile — different clocks, different string
      // precision — and can leave the badge stuck showing unread forever).
      const latestOtherMessageAt = new Map<string, string>();
      if (mapped.length > 0) {
        const { data: recent } = await supabase
          .from("messages")
          .select("channel_id, created_at, sender_id")
          .in("channel_id", mapped.map((c) => c.id))
          .neq("sender_id", user.id)
          .order("created_at", { ascending: false })
          .limit(500);
        for (const m of recent ?? []) {
          if (!latestOtherMessageAt.has(m.channel_id)) latestOtherMessageAt.set(m.channel_id, m.created_at);
          const lastRead = getLastRead(user.id, m.channel_id);
          if (m.created_at > lastRead) {
            const c = mapped.find((ch) => ch.id === m.channel_id);
            if (c) c.unread += 1;
          }
        }
      }

      const initialSelectedId = initialChannelId ?? mapped[0]?.id ?? null;
      if (initialSelectedId) {
        const markReadAt = latestOtherMessageAt.get(initialSelectedId) ?? new Date().toISOString();
        setLastRead(user.id, initialSelectedId, markReadAt);
        const c = mapped.find((ch) => ch.id === initialSelectedId);
        if (c) c.unread = 0;
      }

      setChannels(mapped);
      setSelectedId((prev) => prev ?? initialSelectedId);
    } catch (err) {
      console.error("Chat bootstrap failed:", err);
      setError("Couldn't load chat. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChannelId]);

  useEffect(() => {
    // Guard against React Strict Mode's dev-only double-invoke, which would
    // otherwise race two "no general channel yet" checks and create two.
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;
    bootstrap();
  }, [bootstrap]);

  // Live unread tracking: bump the badge for any channel that isn't currently
  // open when a new message from someone else comes in.
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel("messages-unread-tracker")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const raw = payload.new as { channel_id: string; sender_id: string };
          if (raw.sender_id === currentUserId) return;
          if (raw.channel_id === selectedIdRef.current) return;
          setChannels((prev) =>
            prev.map((c) => (c.id === raw.channel_id ? { ...c, unread: c.unread + 1 } : c))
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  // Load message history whenever the selected channel changes, then mark it
  // read using the newest message's own server timestamp (not the client
  // clock — see the note above about clock/format mismatches).
  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      const res = await fetch(`/api/channels/${selectedId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      const loaded = (data.messages ?? []).map(
        (m: { id: string; text: string; created_at: string; sender?: { id: string; name: string } }) => ({
          id: m.id,
          channel_id: selectedId,
          sender_id: m.sender?.id ?? "",
          sender_name: m.sender?.name ?? "Someone",
          text: m.text,
          created_at: m.created_at,
        })
      );
      setMessages(loaded);

      if (currentUserId) {
        const latest = loaded.length > 0 ? loaded[loaded.length - 1].created_at : new Date().toISOString();
        setLastRead(currentUserId, selectedId, latest);
        setChannels((prev) => prev.map((c) => (c.id === selectedId ? { ...c, unread: 0 } : c)));
      }
    })();
  }, [selectedId, currentUserId]);

  // Typing indicator via Supabase presence — one presence channel per open chat.
  useEffect(() => {
    setTypingUsers([]);
    if (!selectedId || !currentUserId) return;
    const presenceChannel = supabase.channel(`typing:${selectedId}`, {
      config: { presence: { key: currentUserId } },
    });
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState() as Record<string, { user: string; typing: boolean }[]>;
        const names: string[] = [];
        for (const key in state) {
          if (key === currentUserId) continue;
          const latest = state[key][state[key].length - 1];
          if (latest?.typing) names.push(latest.user);
        }
        setTypingUsers(names);
      })
      .subscribe();
    presenceChannelRef.current = presenceChannel;
    return () => {
      supabase.removeChannel(presenceChannel);
      presenceChannelRef.current = null;
    };
  }, [selectedId, currentUserId]);

  const handleTyping = useCallback(
    (typing: boolean) => {
      if (!currentUserId) return;
      const name = directory.find((u) => u.id === currentUserId)?.name ?? "Someone";
      presenceChannelRef.current?.track({ user: name, typing });
    },
    [currentUserId, directory]
  );

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
          // The channel is open right now, so treat its own new messages as read immediately.
          if (currentUserId) setLastRead(currentUserId, raw.channel_id, raw.created_at);
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
    // Instant visual clear for snappy UX; the message-history effect above
    // persists the real (server-timestamp-based) last-read mark once that
    // channel's messages come back.
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
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

  async function createChannel(name: string, memberIds: string[] = []) {
    if (!currentUserId) return;
    const nameTaken = channels.some(
      (c) => !c.is_dm && c.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (nameTaken) {
      alert(`A channel named "${name}" already exists.`);
      return;
    }
    // No members picked = an open channel visible to the whole project (no
    // channel_members rows at all). Otherwise it's private to creator + picks.
    const uniqueMemberIds =
      memberIds.length === 0
        ? []
        : memberIds.includes(currentUserId)
          ? memberIds
          : [currentUserId, ...memberIds];
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: PROJECT_ID, name, member_ids: uniqueMemberIds }),
    });
    if (res.ok) {
      const data = await res.json();
      setChannels((prev) => [
        ...prev,
        { id: data.channel.id, name: data.channel.name, is_dm: false, last_message: "", unread: 0 },
      ]);
      setChannelMembers((prev) => new Map(prev).set(data.channel.id, uniqueMemberIds));
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
      setChannelMembers((prev) => new Map(prev).set(data.channel.id, [currentUserId, otherUserId]));
      selectChannel(data.channel.id);
    } else {
      const data = await res.json().catch(() => ({}));
      alert("Couldn't start DM: " + (data.error || "unknown error"));
    }
  }

  async function deleteChannel(channelId: string) {
    const { error } = await supabase.from("channels").delete().eq("id", channelId);
    if (error) {
      alert("Couldn't delete channel: " + error.message);
      return;
    }
    setChannels((prev) => prev.filter((c) => c.id !== channelId));
    setChannelMembers((prev) => {
      const next = new Map(prev);
      next.delete(channelId);
      return next;
    });
    if (selectedId === channelId) {
      setSelectedId(null);
      setMessages([]);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl px-4 py-6 md:px-6">
        <div className="h-full w-full animate-pulse rounded-2xl bg-slate-900" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl items-center justify-center px-4 py-6 md:px-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-8 text-center">
          <p className="text-sm text-slate-300">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              bootstrap();
            }}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            Retry
          </button>
        </div>
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
          canDeleteChannel={isManager}
          onDeleteChannel={deleteChannel}
        />
      </aside>

      {/* Thread */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        {selected ? (
          <>
            <header className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-slate-500">
                  {selected.is_dm ? <User size={16} /> : <Hash size={16} />}
                </span>
                <h2 className="truncate font-medium text-white">{selected.name}</h2>
              </div>
              {!selected.is_dm && <ChannelMembersButton members={memberNames} />}
            </header>
            <MessageThread messages={messages} currentUserId={currentUserId} />
            {typingUsers.length > 0 && (
              <p className="px-4 pb-1 text-xs italic text-slate-500">
                {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
              </p>
            )}
            <MessageComposer onSend={send} onTyping={handleTyping} />
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
