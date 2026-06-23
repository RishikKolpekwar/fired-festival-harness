"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import RotatingEarth from "@/components/ui/rotating-earth";
import { LockBackdrop } from "@/components/lock-backdrop";
import { NeonText } from "@/components/ui/neon-text";

/** Lock screen: plasma + neon "welcome, rishik" over the rotating globe. The
 * backdrop is the shared LockBackdrop, reused behind the brief and chat too. */
export function WelcomeSplash({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-[#06070b] px-4">
      <LockBackdrop />

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
        className="relative z-10"
      >
        <RotatingEarth
          width={460}
          height={460}
          className="w-[280px] cursor-grab active:cursor-grabbing sm:w-[420px]"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.35, ease: "easeOut" }}
        className="relative z-10 -mt-3 flex flex-col items-center"
      >
        <NeonText
          text="welcome, rishik"
          className="h-[54px] w-[92vw] max-w-[560px] sm:h-[78px]"
        />

        <button
          onClick={onEnter}
          className="beam-border group relative mt-5 rounded-full"
        >
          <span className="relative flex items-center gap-3 rounded-full bg-[#0b0f17]/85 px-10 py-3.5 font-mono text-[12px] uppercase tracking-[0.34em] text-white shadow-[0_0_34px_-8px_rgba(20,136,252,0.7)] backdrop-blur-xl transition-colors group-hover:text-[#bfe0ff]">
            enter
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </span>
        </button>
        <span className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#5a6477]">
          drag the globe · solo harness
        </span>
      </motion.div>
    </div>
  );
}
