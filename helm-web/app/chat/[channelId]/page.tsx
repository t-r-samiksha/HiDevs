"use client";

import { useParams } from "next/navigation";
import ChatView from "../../components/chat/ChatView";

export default function ChatChannelPage() {
  const params = useParams();
  const channelId = params.channelId as string;
  return <ChatView initialChannelId={channelId} />;
}
