"use client";

import { useEffect, useRef } from "react";

/**
 * A slim row of glyphs (default ✦) with an animated rainbow vertical-streak
 * text-shadow. Adapted from the "animated hearts" effect, themed to the app's
 * blue/teal palette and scoped to its own container so it never touches other
 * elements on the page.
 */
export function SparkleRow({
  text = "✦",
  count = 7,
  colors = [
    "#5e60ce",
    "#5390d9",
    "#4ea8de",
    "#48bfe3",
    "#56cfe1",
    "#64dfdf",
    "#72efdd",
    "#80ffdb",
    "#7cc0ff",
    "#a9c7ff",
  ],
  animationDuration = 2.4,
  fontSize = "26px",
  staggerDelay = 180,
  heightFactor = 0.28,
  className = "",
}: {
  text?: string;
  count?: number;
  colors?: string[];
  animationDuration?: number;
  fontSize?: string;
  staggerDelay?: number;
  heightFactor?: number;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let from = "";
    let to = "";
    colors
      .slice()
      .reverse()
      .forEach((c, i) => {
        from += `,0 ${(i - 5) * heightFactor}vh ${i * 2}px ${c}`;
      });
    colors.forEach((c, i) => {
      to += `,0 ${(i - 5) * -heightFactor}vh ${i * 2}px ${c}`;
    });
    from = from.substring(1);
    to = to.substring(1);

    const style = document.createElement("style");
    style.textContent = `@keyframes soloSparkleShadow {0%{text-shadow:${from};}100%{text-shadow:${to};}}`;
    document.head.appendChild(style);

    const spans = root.querySelectorAll<HTMLElement>(".solo-sparkle");
    spans.forEach((el, i) => {
      el.style.animation = `soloSparkleShadow ${animationDuration}s cubic-bezier(0.3,0,0.7,1) infinite alternate both`;
      el.style.animationDelay = `${-1000 + i * staggerDelay}ms`;
    });

    return () => {
      document.head.removeChild(style);
    };
  }, [colors, animationDuration, staggerDelay, heightFactor]);

  return (
    <div
      ref={rootRef}
      className={`flex items-center justify-center gap-9 ${className}`}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="solo-sparkle inline-block"
          style={{ fontSize, color: "transparent" }}
        >
          {text}
        </span>
      ))}
    </div>
  );
}
