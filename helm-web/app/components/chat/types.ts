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
