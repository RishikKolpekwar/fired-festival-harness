"use client";

import { useState } from "react";
import {
  FileText,
  ListChecks,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import type { Thread } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

export type Section = "chat" | "brief" | "followups";

/** A nav tab in the rail — neon ink accent bar when active, no filled chip. */
function RailNavItem({
  active,
  open,
  onClick,
  icon,
  label,
  dot,
}: {
  active: boolean;
  open: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  dot?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "relative flex items-center transition-colors",
        open ? "h-9 w-full gap-2.5 px-2.5" : "mx-auto size-9 justify-center",
        active ? "text-[#5ee3c0]" : "text-[#8a8a8f] hover:text-[#e8edf5]",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[#5ee3c0] shadow-[0_0_8px_#5ee3c0]" />
      )}
      {icon}
      {open && (
        <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
          {label}
        </span>
      )}
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full bg-[#5ee3c0] shadow-[0_0_8px_#5ee3c0]",
            open ? "ml-auto" : "absolute right-1.5 top-1.5",
          )}
        />
      )}
    </button>
  );
}

/** Sidebar: Chat / Brief tabs + collapsible thread history. Editorial chrome —
 * dark over the shared backdrop, hairline rules, neon as an ink accent, no
 * boxed tiles. */
export function HistoryRail({
  threads,
  activeId,
  section,
  hasBrief,
  onSelect,
  onNew,
  onSection,
}: {
  threads: Thread[];
  activeId?: string;
  section: Section;
  hasBrief: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSection: (s: Section) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <aside
      className={cn(
        "relative z-30 flex h-full flex-shrink-0 flex-col border-r border-white/[0.08] bg-[#06070b]/55 backdrop-blur-xl transition-[width] duration-300 ease-out",
        open ? "w-[248px]" : "w-[60px]",
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] p-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex size-9 flex-shrink-0 items-center justify-center text-[#8a8a8f] transition-colors hover:text-[#e8edf5]"
          title={open ? "collapse" : "expand"}
        >
          {open ? (
            <PanelLeftClose className="size-[18px]" />
          ) : (
            <PanelLeftOpen className="size-[18px]" />
          )}
        </button>
        {open && (
          <span className="font-serif text-[18px] font-semibold tracking-tight text-[#e8edf5]">
            s01o
          </span>
        )}
      </div>

      {/* tabs */}
      <nav className="flex flex-col gap-1.5 px-2.5 pt-3">
        <RailNavItem
          active={section === "chat"}
          open={open}
          onClick={() => onSection("chat")}
          label="chat"
          icon={<MessageSquare className="size-[18px]" />}
        />
        <RailNavItem
          active={section === "brief"}
          open={open}
          onClick={() => onSection("brief")}
          label="brief"
          icon={<FileText className="size-[18px]" />}
          dot={hasBrief}
        />
        <RailNavItem
          active={section === "followups"}
          open={open}
          onClick={() => onSection("followups")}
          label="follow-ups"
          icon={<ListChecks className="size-[18px]" />}
        />
      </nav>

      {/* thread history (chat section) */}
      {section === "chat" && (
        <>
          <div className="mx-3 my-3 h-px bg-white/[0.06]" />
          <div className="flex items-center justify-between px-3">
            {open && (
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#5ee3c0]">
                threads
              </span>
            )}
            <button
              onClick={onNew}
              title="new chat"
              className={cn(
                "flex size-7 items-center justify-center text-[#8a8a8f] transition-colors hover:text-[#5ee3c0]",
                !open && "mx-auto",
              )}
            >
              <Plus className="size-4" />
            </button>
          </div>

          {open && (
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {threads.length === 0 ? (
                <p className="py-3 font-serif text-[14px] italic text-[#6a7283]">
                  no past threads yet
                </p>
              ) : (
                <div>
                  {threads.map((t) => {
                    const active = t.id === activeId;
                    return (
                      <button
                        key={t.id}
                        onClick={() => onSelect(t.id)}
                        className={cn(
                          "group relative flex w-full flex-col gap-0.5 border-b border-white/[0.05] py-2.5 pl-3 text-left transition-colors",
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[#5ee3c0] shadow-[0_0_8px_#5ee3c0]" />
                        )}
                        <span
                          className={cn(
                            "truncate font-serif text-[15px] leading-snug transition-colors",
                            active
                              ? "text-[#e8edf5]"
                              : "text-[#a8b0bd] group-hover:text-[#e8edf5]",
                          )}
                        >
                          {t.title}
                        </span>
                        <span className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-[#5a6477]">
                          {timeAgo(t.updatedAt)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
