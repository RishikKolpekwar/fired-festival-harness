"use client";

import { useEffect, useRef } from "react";

/**
 * Animated plasma wave (Canvas 2D). The per-pixel loop is expensive, so we
 * compute at a low internal resolution and upscale to fill — looks like a soft
 * moving gradient, stays cheap. Used as the background while interacting (chat).
 */
export function HeroWave({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cw = 0;
    let chh = 0;
    let w = 0;
    let h = 0;
    let imageData: ImageData;
    let data: Uint8ClampedArray;
    let buf: HTMLCanvasElement;
    let bctx: CanvasRenderingContext2D | null = null;

    const resize = () => {
      cw = canvas.clientWidth || window.innerWidth;
      chh = canvas.clientHeight || window.innerHeight;
      canvas.width = cw;
      canvas.height = chh;
      // internal compute resolution capped ~200px wide
      const aspect = chh / cw;
      w = Math.min(200, cw);
      h = Math.max(2, Math.floor(w * aspect));
      buf = document.createElement("canvas");
      buf.width = w;
      buf.height = h;
      bctx = buf.getContext("2d");
      if (bctx) {
        imageData = bctx.createImageData(w, h);
        data = imageData.data;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const start = Date.now();
    const SIN = new Float32Array(1024);
    const COS = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const a = (i / 1024) * Math.PI * 2;
      SIN[i] = Math.sin(a);
      COS[i] = Math.cos(a);
    }
    const fsin = (x: number) =>
      SIN[Math.floor(((x % (Math.PI * 2)) / (Math.PI * 2)) * 1024) & 1023];
    const fcos = (x: number) =>
      COS[Math.floor(((x % (Math.PI * 2)) / (Math.PI * 2)) * 1024) & 1023];

    let raf = 0;
    let running = true;

    const render = () => {
      raf = requestAnimationFrame(render);
      if (!running || !bctx) return;
      const time = (Date.now() - start) * 0.001;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const ux = (2 * x - w) / h;
          const uy = (2 * y - h) / h;
          let a = 0;
          let d = 0;
          for (let i = 0; i < 4; i++) {
            a += fcos(i - d + time * 0.5 - a * ux);
            d += fsin(i * uy + a);
          }
          const wave = (fsin(a) + fcos(d)) * 0.5;
          const intensity = 0.3 + 0.4 * wave;
          const base = 0.1 + 0.15 * fcos(ux + uy + time * 0.3);
          const blue = 0.2 * fsin(a * 1.5 + time * 0.2);
          const purple = 0.15 * fcos(d * 2 + time * 0.1);
          const r = Math.max(0, Math.min(1, base + purple * 0.8)) * intensity;
          const g = Math.max(0, Math.min(1, base + blue * 0.6)) * intensity;
          const b =
            Math.max(0, Math.min(1, base + blue * 1.2 + purple * 0.4)) *
            intensity;
          const idx = (y * w + x) * 4;
          data[idx] = r * 255;
          data[idx + 1] = g * 255;
          data[idx + 2] = b * 255;
          data[idx + 3] = 255;
        }
      }
      bctx.putImageData(imageData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(buf, 0, 0, w, h, 0, 0, cw, chh);
    };
    render();

    const onVis = () => {
      running = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none block h-full w-full ${className}`}
    />
  );
}
