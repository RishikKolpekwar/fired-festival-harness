"use client";

import { ChatInput } from "@/components/ui/bolt-style-chat";

/** Docked input for the in-conversation view (reuses the hero's ChatInput). */
export function Composer({
  onSend,
  disabled,
  selectedModel,
}: {
  onSend: (message: string) => void;
  disabled?: boolean;
  selectedModel?: string;
}) {
  return (
    <div className="glass relative z-10 border-x-0 border-b-0 px-4 pb-5 pt-3">
      <ChatInput
        onSend={onSend}
        disabled={disabled}
        selectedModel={selectedModel}
        placeholder="ask your harness anything…"
      />
      <p className="mx-auto mt-2 max-w-[680px] text-center text-[11px] text-[#4a4a4f]">
        grounded in your email, messages, calendar, news & jobs · enter to send,
        shift+enter for newline
      </p>
    </div>
  );
}
