// Mock chat data — used until Member 1 ships the channels / messages /
// channel_members tables (and enables Realtime on `messages`).
// TODO: Replace loadChannels / loadMessages with real Supabase queries:
//   channels  ← channels JOIN channel_members (for the current user)
//   messages  ← messages WHERE channel_id = ? ORDER BY created_at

export type Channel = {
  id: string;
  name: string;
  is_dm: boolean;
  last_message: string;
  unread: number;
};

export type Message = {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string;
  text: string;
  created_at: string;
};

export const CURRENT_USER_ID = "you";

export const MOCK_CHANNELS: Channel[] = [
  { id: "c-general", name: "general", is_dm: false, last_message: "Ship the demo by Friday 🚀", unread: 2 },
  { id: "c-eng", name: "engineering", is_dm: false, last_message: "DB migration is merged", unread: 0 },
  { id: "c-product", name: "product", is_dm: false, last_message: "Reviewing the new dashboard", unread: 1 },
  { id: "dm-rahul", name: "Rahul", is_dm: true, last_message: "I'll set up MongoDB today", unread: 0 },
  { id: "dm-priya", name: "Priya", is_dm: true, last_message: "Thanks for the update!", unread: 3 },
];

const now = Date.now();
const min = (m: number) => new Date(now - m * 60_000).toISOString();

export const MOCK_MESSAGES: Record<string, Message[]> = {
  "c-general": [
    { id: "m1", channel_id: "c-general", sender_id: "priya", sender_name: "Priya", text: "Morning all — standup in 10.", created_at: min(120) },
    { id: "m2", channel_id: "c-general", sender_id: "rahul", sender_name: "Rahul", text: "On it. DB work is nearly done.", created_at: min(115) },
    { id: "m3", channel_id: "c-general", sender_id: "priya", sender_name: "Priya", text: "Ship the demo by Friday 🚀", created_at: min(30) },
  ],
  "c-eng": [
    { id: "m4", channel_id: "c-eng", sender_id: "rahul", sender_name: "Rahul", text: "DB migration is merged", created_at: min(200) },
  ],
  "c-product": [
    { id: "m5", channel_id: "c-product", sender_id: "you", sender_name: "You", text: "Reviewing the new dashboard", created_at: min(45) },
  ],
  "dm-rahul": [
    { id: "m6", channel_id: "dm-rahul", sender_id: "rahul", sender_name: "Rahul", text: "I'll set up MongoDB today", created_at: min(90) },
  ],
  "dm-priya": [
    { id: "m7", channel_id: "dm-priya", sender_id: "priya", sender_name: "Priya", text: "Thanks for the update!", created_at: min(10) },
  ],
};
