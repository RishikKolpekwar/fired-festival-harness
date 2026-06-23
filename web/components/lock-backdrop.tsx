"use client";

import { HeroWave } from "@/components/ui/hero-wave";

/**
 * The lock-screen background treatment, extracted to ONE source of truth so the
 * splash, the brief, and the chat all render the exact same backdrop: the plasma
 * wave, a #06070b dim, and a soft neon radial glow. Fills its nearest positioned
 * ancestor — wrap it in a `relative` (scoped) or `fixed` (global) container.
 */
export function LockBackdrop({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[#06070b] ${className}`}
    >
      <HeroWave />
      <div className="absolute inset-0 bg-[#06070b]/66" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(48% 48% at 50% 44%, rgba(20,136,252,0.15) 0%, transparent 72%)",
        }}
      />
    </div>
  );
}
