"use client";

import { FileText, Sparkles } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-model";
import { cn, formatTime } from "@/lib/utils";
import { ToolStatus } from "./tool-status";
import { CheckpointBar } from "./checkpoint-bar";
import { AlarmChip } from "./alarm-chip";
import { Markdown } from "./markdown";

export function MessageBubble({
  message,
  onOpenCanvas,
}: {
  message: ChatMessage;
  onOpenCanvas?: () => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#1488fc] px-4 py-2.5 text-[15px] text-white shadow-[0_2px_16px_rgba(20,136,252,0.25)]">
          {message.content}
        </div>
      </div>
    );
  }

  const streamingEmpty = message.streaming && !message.content;

  return (
    <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="mt-0.5 flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/10">
        <Sparkles className="size-3.5 text-[#1488fc]" />
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {/* live tool trace */}
        {message.toolLines && message.toolLines.length > 0 && (
          <ToolStatus lines={message.toolLines} done={!message.streaming} />
        )}

        {/* pillar checkpoints (brief generation) */}
        {message.checkpoints && message.checkpoints.length > 0 && (
          <CheckpointBar checkpoints={message.checkpoints} />
        )}

        {/* assistant text */}
        {streamingEmpty ? (
          <div className="flex items-center gap-2 text-sm text-[#8a8a8f]">
            <span className="inline-flex gap-1">
              <span className="size-1.5 animate-solo-pulse rounded-full bg-[#8a8a8f]" />
              <span
                className="size-1.5 animate-solo-pulse rounded-full bg-[#8a8a8f]"
                style={{ animationDelay: "0.2s" }}
              />
              <span
                className="size-1.5 animate-solo-pulse rounded-full bg-[#8a8a8f]"
                style={{ animationDelay: "0.4s" }}
              />
            </span>
            thinking…
          </div>
        ) : (
          message.content && (
            <div className="text-[#e4e4e9]">
              <Markdown content={message.content} />
              {message.streaming && (
                <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-solo-blink bg-[#1488fc]" />
              )}
            </div>
          )
        )}

        {/* canvas re-open chip */}
        {message.canvasKind === "brief" && (
          <button
            onClick={onOpenCanvas}
            className="inline-flex items-center gap-2 rounded-xl border border-[#1488fc]/30 bg-[#1488fc]/10 px-3 py-2 text-sm font-medium text-[#7cc0ff] transition-colors hover:bg-[#1488fc]/15"
          >
            <FileText className="size-4" />
            Open morning brief
          </button>
        )}

        {/* inline alarms for this turn */}
        {message.alarms?.map((a, i) => (
          <AlarmChip key={`${a.type}-${i}`} alarm={a} />
        ))}

        {/* error state */}
        {message.error && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
            {message.error}
          </div>
        )}

        {/* timestamp + tools footer */}
        {!message.streaming && message.content && (
          <div className="flex items-center gap-2 text-[11px] text-[#5a5a5f]">
            <span>{formatTime(message.ts)}</span>
            {message.usedTools && message.usedTools.length > 0 && (
              <span className={cn("text-[#5a5a5f]")}>
                · {message.usedTools.length} tool
                {message.usedTools.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
