// Shared chat types, backed by Member 1's channels / messages tables.
//   Channel ← channels JOIN channel_members (for the current user)
//   Message ← messages WHERE channel_id = ? ORDER BY created_at

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
