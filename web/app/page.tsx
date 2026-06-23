"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Bell, Bot, FileText, Plus } from "lucide-react";
import { useHarness } from "@/hooks/use-harness";
import { Backdrop } from "@/components/backdrop";
import { BoltStyleChat } from "@/components/ui/bolt-style-chat";
import { MessageList } from "@/components/chat/message-list";
import { Composer } from "@/components/chat/composer";
import { SlideCanvas } from "@/components/canvas/slide-canvas";
import { HistoryRail, type Section } from "@/components/history-rail";
import { HealthDot } from "@/components/health-dot";
import { BriefPage } from "@/components/brief-page";
import { FollowUpsBoard } from "@/components/followups-board";
import { AlarmChip } from "@/components/chat/alarm-chip";
import { WelcomeSplash } from "@/components/welcome-splash";
import { SplineScene } from "@/components/ui/spline-scene";
import { ErrorBoundary } from "@/components/ui/error-boundary";

const ROBOT_SCENE = "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode";

export default function Home() {
  const h = useHarness();
  const [showAlarms, setShowAlarms] = useState(false);
  const [entered, setEntered] = useState(false);
  const [section, setSection] = useState<Section>("chat");

  if (!entered) return <WelcomeSplash onEnter={() => setEntered(true)} />;

  const goChat = (s: Section) => {
    setSection(s);
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-transparent">
      <Backdrop />
      <HistoryRail
        threads={h.threads}
        activeId={h.threadId}
        section={section}
        hasBrief={!!h.latestBrief}
        onSelect={(id) => {
          setSection("chat");
          h.loadThread(id);
        }}
        onNew={() => {
          setSection("chat");
          h.newThread();
        }}
        onSection={goChat}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {section === "brief" ? (
          /* ---------- Brief tab (full page) ---------- */
          <>
            <div className="absolute right-4 top-4 z-20">
              <HealthDot health={h.health} error={h.healthError} />
            </div>
            {h.latestBrief ? (
              <BriefPage
                brief={h.latestBrief}
                onApprove={h.approveDraft}
                onRegenerate={h.generateBrief}
                streaming={h.streaming}
                onAskAbout={(text) => {
                  setSection("chat");
                  h.send(
                    `In my brief I highlighted "${text}". Tell me what it is and why it matters to me specifically.`,
                  );
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-[#5ee3c0]">
                  the morning edition
                </span>
                <h2 className="mt-3 font-serif text-[44px] font-semibold tracking-[-0.02em] text-[#e8edf5]">
                  {h.streaming ? "composing today’s brief" : "no brief yet"}
                </h2>
                <p className="mt-2 font-serif text-[16px] italic text-[#a8b0bd]">
                  {h.streaming
                    ? "reading your sources, drafting the read"
                    : "generate today’s read from your sources"}
                </p>
                <button
                  onClick={h.generateBrief}
                  disabled={h.streaming}
                  className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5ee3c0] underline decoration-[#5ee3c0]/40 underline-offset-4 transition-opacity hover:opacity-70 disabled:opacity-40"
                >
                  {h.streaming ? "composing…" : "generate brief"}
                </button>
              </div>
            )}
          </>
        ) : section === "followups" ? (
          /* ---------- Follow-ups tab (command board) ---------- */
          <>
            <div className="absolute right-4 top-4 z-20">
              <HealthDot health={h.health} error={h.healthError} />
            </div>
            <FollowUpsBoard
              onAct={(item) => {
                setSection("chat");
                // open-ended collaborative compose: seed the harness with the
                // follow-up CONTEXT (who / what's owed) and let it ask Rishik
                // for his direction before drafting — no canned reply.
                h.send(
                  `help me follow up with ${item.who}${item.org ? ` (${item.org})` : ""}. context: ${item.pending}. ask me what i want to say first, then draft the reply in my voice.`,
                );
              }}
            />
          </>
        ) : !h.hasStarted ? (
          /* ---------- Chat home (hero + robot companion) ---------- */
          <>
            <div className="absolute right-4 top-4 z-20">
              <HealthDot health={h.health} error={h.healthError} />
            </div>
            {/* robot companion, lives in the corner of your personal chat */}
            <div className="pointer-events-auto absolute bottom-0 right-0 z-[5] hidden h-[420px] w-[440px] 2xl:block">
              <ErrorBoundary
                fallback={
                  <div className="flex h-full w-full items-end justify-center pb-10">
                    <Bot className="size-16 text-white/10" />
                  </div>
                }
              >
                <SplineScene scene={ROBOT_SCENE} className="h-full w-full" />
              </ErrorBoundary>
            </div>
            <BoltStyleChat
              selectedModel={h.health?.model}
              disabled={h.streaming}
              onSend={h.send}
            />
          </>
        ) : (
          /* ---------- In-conversation view ---------- */
          <>
            {/* readability scrim over the shared plasma backdrop */}
            <div className="pointer-events-none absolute inset-0 z-0 bg-[#06070b]/45" />
            <motion.header
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="relative z-20 flex flex-shrink-0 items-center gap-5 border-b border-white/[0.08] bg-[#06070b]/40 px-5 py-2.5 backdrop-blur-xl"
            >
              <button
                onClick={h.newThread}
                className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#8a8a8f] transition-colors hover:text-[#5ee3c0]"
              >
                <Plus className="size-3.5" />
                <span className="hidden sm:inline">new</span>
              </button>

              <button
                onClick={() => setSection("brief")}
                className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#8a8a8f] transition-colors hover:text-[#5ee3c0]"
              >
                <FileText className="size-3.5" />
                <span className="hidden sm:inline">brief</span>
              </button>

              <div className="ml-auto flex items-center gap-5">
                <div className="relative">
                  <button
                    onClick={() => setShowAlarms((s) => !s)}
                    className="relative flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#8a8a8f] transition-colors hover:text-[#5ee3c0]"
                  >
                    <Bell className="size-3.5" />
                    {h.alarms.length > 0 && (
                      <span className="font-mono text-[10px] font-semibold text-amber-300">
                        {h.alarms.length}
                      </span>
                    )}
                  </button>
                  {showAlarms && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowAlarms(false)}
                      />
                      <div className="absolute right-0 top-full z-50 mt-2 max-h-[60vh] w-[320px] space-y-2 overflow-y-auto border border-white/10 bg-[#06070b]/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150">
                        {h.alarms.length === 0 ? (
                          <p className="px-2 py-3 text-center font-serif text-[14px] italic text-[#6a7283]">
                            no alarms. all clear.
                          </p>
                        ) : (
                          h.alarms.map((a, i) => (
                            <AlarmChip key={`${a.type}-${i}`} alarm={a} />
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>

                <HealthDot health={h.health} error={h.healthError} />
              </div>
            </motion.header>

            <div className="relative z-10 min-h-0 flex-1 overflow-y-auto">
              <MessageList
                messages={h.messages}
                onOpenCanvas={h.openBriefCanvas}
              />
            </div>

            <Composer
              onSend={h.send}
              disabled={h.streaming}
              selectedModel={h.health?.model}
            />
          </>
        )}
      </main>

      <SlideCanvas
        canvas={h.canvas}
        onClose={h.closeCanvas}
        onApprove={h.approveDraft}
      />
    </div>
  );
}
