"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Neon RGB chromatic-aberration wordmark (WebGL). Renders the text three times
 * in red / green / blue with a small horizontal offset and additive blending,
 * so it glows white at the core with colored fringes. Animated for a subtle
 * living shimmer. Falls back to a CSS chromatic treatment without WebGL.
 */
export function NeonText({
  text = "solo",
  className = "",
}: {
  text?: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      setFailed(true);
      return;
    }

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(
      vs,
      `attribute vec2 position;
       varying vec2 vUv;
       void main(){
         vUv = vec2(position.x*0.5+0.5, 1.0-(position.y*0.5+0.5));
         gl_Position = vec4(position, 0.0, 1.0);
       }`,
    );
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(
      fs,
      `precision mediump float;
       uniform sampler2D uTexture;
       uniform vec2 uOffset;
       uniform vec3 uColor;
       varying vec2 vUv;
       void main(){
         vec2 d = vUv + vec2(uOffset.x, -uOffset.y);
         vec4 texel = texture2D(uTexture, d);
         gl_FragColor = vec4(uColor * texel.a * 1.5, texel.a);
       }`,
    );
    gl.compileShader(fs);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    const uTex = gl.getUniformLocation(program, "uTexture");
    const uOffset = gl.getUniformLocation(program, "uOffset");
    const uColor = gl.getUniformLocation(program, "uColor");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    let cssW = 0;
    let cssH = 0;

    const buildTexture = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const tc = document.createElement("canvas");
      tc.width = Math.max(2, Math.floor(cssW * dpr));
      tc.height = Math.max(2, Math.floor(cssH * dpr));
      const tctx = tc.getContext("2d")!;
      tctx.clearRect(0, 0, tc.width, tc.height);

      // fit font to ~78% width
      let fontPx = tc.height * 0.74;
      const font = (p: number) =>
        `800 ${p}px system-ui, "Segoe UI", Helvetica, Arial, sans-serif`;
      tctx.font = font(fontPx);
      const max = tc.width * 0.82;
      while (tctx.measureText(text).width > max && fontPx > 10) {
        fontPx -= 2;
        tctx.font = font(fontPx);
      }
      tctx.fillStyle = "#fff";
      tctx.textAlign = "center";
      tctx.textBaseline = "middle";
      tctx.fillText(text, tc.width / 2, tc.height / 2 + fontPx * 0.04);

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = Math.max(1, Math.floor(rect.width));
      cssH = Math.max(1, Math.floor(rect.height));
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
      buildTexture();
    };

    // Static final state — a fixed blurred chromatic split (no animation).
    const AMT = 0.0075;
    const render = () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const channels: Array<{ c: [number, number, number]; o: [number, number] }> = [
        { c: [1, 0.15, 0.35], o: [AMT, 0] },
        { c: [0.3, 1, 0.7], o: [0, 0] },
        { c: [0.3, 0.55, 1], o: [-AMT, 0] },
      ];
      for (const { c, o } of channels) {
        gl.uniform2fv(uOffset, o);
        gl.uniform3fv(uColor, c);
        gl.uniform1i(uTex, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };

    resize();
    render();

    const ro = new ResizeObserver(() => {
      resize();
      render();
    });
    ro.observe(wrap);

    return () => {
      ro.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
    };
  }, [text]);

  return (
    <div
      ref={wrapRef}
      className={`relative ${className}`}
      style={{ containerType: "size" }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="whitespace-nowrap font-display font-extrabold lowercase leading-none tracking-tight text-white"
            style={{
              fontSize: "78cqh",
              textShadow:
                "2px 0 0 rgba(255,40,90,0.55), -2px 0 0 rgba(60,140,255,0.55), 0 0 28px rgba(120,180,255,0.45)",
            }}
          >
            {text}
          </span>
        </div>
      )}
    </div>
  );
}
