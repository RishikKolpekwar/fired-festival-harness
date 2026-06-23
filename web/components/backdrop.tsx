"use client";

import { LockBackdrop } from "@/components/lock-backdrop";

/**
 * Persistent app backdrop, mounted once so it never unmounts across the hero and
 * chat views. It now renders the SHARED lock-screen treatment (plasma + dim +
 * neon glow) so the chat and the brief match the lock screen exactly — one
 * source of truth in <LockBackdrop>.
 */
export function Backdrop() {
  return <LockBackdrop className="fixed -z-10" />;
}
