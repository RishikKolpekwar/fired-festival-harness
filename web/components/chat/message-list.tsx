"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/chat-model";
import { MessageBubble } from "./message-bubble";

export function MessageList({
  messages,
  onOpenCanvas,
}: {
  messages: ChatMessage[];
  onOpenCanvas?: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the latest content in view as tokens stream in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-6 px-4 py-8">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} onOpenCanvas={onOpenCanvas} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
