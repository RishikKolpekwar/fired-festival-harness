"use client";

// BriefArt — the article "cut": a single toned image for a brief item, styled to
// sit inside the dark broadsheet without fighting the typography. The backend
// already populates `item.image` (Exa match + og:image scrape, ~70% of items);
// this just renders it. NO sourcing, no AI-gen, no placeholder art:
// image-less items are pure typography, so we return null and that's correct,
// not a degraded path. Self-contained leaf — cd8b8c imports and places it.

import { useState } from "react";
import type { BriefItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Only render real remote covers. Guards against empty strings, data URIs,
 *  site icons, and anything that isn't an http(s) URL the <img> can load. */
function isRenderableImage(url?: string): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function BriefArt({
  item,
  variant = "page",
  // page lead story runs a larger feature cut; everything else is restrained.
  lead = false,
  className,
}: {
  item: BriefItem;
  variant?: "page" | "panel";
  lead?: boolean;
  className?: string;
}) {
  // If the cover 404s / hot-links fail at runtime, fall back to pure typography
  // rather than showing a broken-image box.
  const [failed, setFailed] = useState(false);

  if (!isRenderableImage(item.image) || failed) return null;

  // Aspect: feature-wide for the page lead, a calmer strip for body stories,
  // compact for the slide-out panel.
  const aspect =
    variant === "panel"
      ? "aspect-[16/7]"
      : lead
        ? "aspect-[3/2]"
        : "aspect-[2/1]";

  return (
    <figure
      className={cn(
        "relative w-full overflow-hidden",
        // hairline frame at most — no card box, no shadow
        variant === "panel" ? "rounded-lg" : "rounded-[3px]",
        aspect,
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- plain lazy <img>:
          covers come from arbitrary article domains, so we deliberately skip
          next/image (no images.remotePatterns allowlist to maintain). */}
      <img
        src={item.image}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        // natural full-color photo — no filter, no overlay (Rishik's call)
        className="size-full object-cover"
      />
      {/* hairline frame, matched to --rule */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10"
      />
    </figure>
  );
}
