import { supabase } from "@/lib/supabase";

// Single hardcoded project until the pipeline supports real multi-project selection.
export const CHAT_PROJECT_ID = "a1b2c3d4-0000-0000-0000-000000000001";

// Per-user, per-channel "last read" timestamps, kept client-side since the
// channel_members table has no read-receipt column yet.
const LAST_READ_PREFIX = "helm-chat-last-read";
const READ_EVENT = "helm-chat-read";

export function getLastRead(userId: string, channelId: string): string {
  if (typeof window === "undefined") return new Date(0).toISOString();
  return localStorage.getItem(`${LAST_READ_PREFIX}:${userId}:${channelId}`) ?? new Date(0).toISOString();
}

export function setLastRead(userId: string, channelId: string, timestamp: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${LAST_READ_PREFIX}:${userId}:${channelId}`, timestamp);
  // Let anything else showing an unread count (e.g. the sidebar nav badge)
  // know it should recompute right away instead of waiting for the next
  // message insert to happen to notice.
  window.dispatchEvent(new Event(READ_EVENT));
}

/** Fires whenever a channel gets marked read anywhere in the app. */
export function onChannelRead(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(READ_EVENT, callback);
  return () => window.removeEventListener(READ_EVENT, callback);
}

/**
 * Which channel/DM ids `userId` can currently see — mirrors ChatView's
 * visibility rule: DMs require explicit membership; a channel with no
 * recorded members is open to the whole project; one with recorded members
 * requires explicit membership.
 */
async function getVisibleChannelIds(userId: string): Promise<string[]> {
  const [channelsRes, { data: memberRows }] = await Promise.all([
    fetch(`/api/channels?project_id=${CHAT_PROJECT_ID}`).then((r) => r.json()),
    supabase.from("channel_members").select("channel_id, user_id"),
  ]);
  const rawChannels: { id: string; is_dm: boolean }[] = channelsRes.channels ?? [];

  const myChannelIds = new Set(
    (memberRows ?? []).filter((r) => r.user_id === userId).map((r) => r.channel_id)
  );
  const memberCountByChannel = new Map<string, number>();
  for (const row of memberRows ?? []) {
    memberCountByChannel.set(row.channel_id, (memberCountByChannel.get(row.channel_id) ?? 0) + 1);
  }

  return rawChannels
    .filter((c) =>
      c.is_dm
        ? myChannelIds.has(c.id)
        : (memberCountByChannel.get(c.id) ?? 0) === 0 || myChannelIds.has(c.id)
    )
    .map((c) => c.id);
}

/** Total unread messages across every channel/DM this user can currently see. */
export async function getTotalUnreadCount(userId: string): Promise<number> {
  const channelIds = await getVisibleChannelIds(userId);
  if (channelIds.length === 0) return 0;

  const { data: recent, error } = await supabase
    .from("messages")
    .select("channel_id, created_at")
    .in("channel_id", channelIds)
    .neq("sender_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  let total = 0;
  for (const m of recent ?? []) {
    if (m.created_at > getLastRead(userId, m.channel_id)) total += 1;
  }
  return total;
}
