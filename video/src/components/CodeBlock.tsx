import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { CODE, COLORS, FONT } from "../theme";

const KEYWORDS = new Set([
  "export","const","let","interface","type","function","return","async","await","if","else",
  "for","of","in","new","import","from","class","extends","implements","public","private",
  "this","true","false","null","undefined","void","string","number","boolean","Promise","as","enum",
]);

// crude but pretty TS tokenizer (good enough for short snippets)
function tokenize(line: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const commentIdx = line.indexOf("//");
  let code = line;
  let comment = "";
  if (commentIdx >= 0 && !line.slice(0, commentIdx).includes('"') && !line.slice(0, commentIdx).includes("'")) {
    code = line.slice(0, commentIdx);
    comment = line.slice(commentIdx);
  }
  const re = /(\s+|"[^"]*"|'[^']*'|`[^`]*`|\b\d+(?:_\d+)*(?:\.\d+)?\b|[A-Za-z_$][A-Za-z0-9_$]*|[{}()[\].,:;=<>?!|&+\-*/%]+)/g;
  const parts = code.match(re) ?? [code];
  parts.forEach((p, i) => {
    let color = CODE.plain;
    if (/^\s+$/.test(p)) {
      out.push(<span key={i}>{p}</span>);
      return;
    }
    if (/^["'`]/.test(p)) color = CODE.string;
    else if (/^\d/.test(p)) color = CODE.number;
    else if (KEYWORDS.has(p)) color = CODE.keyword;
    else if (/^[A-Z][A-Z0-9_]+$/.test(p)) color = CODE.const; // ALL_CAPS declared constants
    else if (/^[A-Z]/.test(p)) color = CODE.type; // Types / Classes
    else if (/^[{}()[\].,:;=<>?!|&+\-*/%]+$/.test(p)) color = CODE.punct;
    out.push(
      <span key={i} style={{ color }}>
        {p}
      </span>
    );
  });
  if (comment) out.push(<span key="c" style={{ color: CODE.comment, fontStyle: "italic" }}>{comment}</span>);
  return out;
}

export interface CodeBlockProps {
  title?: string;
  lines: string[];
  startFrame?: number;
  perLine?: number; // frames between line reveals
  fontSize?: number;
  highlight?: number[]; // line indices to pulse
  highlightAt?: number; // local frame when highlight kicks in
  highlightColor?: string;
  width?: number;
  showLineNumbers?: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  title,
  lines,
  startFrame = 0,
  perLine = 3,
  fontSize = 21,
  highlight = [],
  highlightAt = 9999,
  highlightColor = COLORS.blue,
  width = 940,
  showLineNumbers = true,
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  const hSet = new Set(highlight);

  return (
    <div
      style={{
        width,
        borderRadius: 16,
        background: CODE.bg,
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 30px 80px -40px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)",
        overflow: "hidden",
        fontFamily: FONT.mono,
      }}
    >
      {/* window chrome */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <span style={{ width: 11, height: 11, borderRadius: 99, background: "#ff5f57" }} />
        <span style={{ width: 11, height: 11, borderRadius: 99, background: "#febc2e" }} />
        <span style={{ width: 11, height: 11, borderRadius: 99, background: "#28c840" }} />
        {title && (
          <span style={{ marginLeft: 10, fontSize: 13.5, color: COLORS.muted, letterSpacing: "0.02em" }}>
            {title}
          </span>
        )}
      </div>

      <div style={{ padding: "18px 20px", lineHeight: 1.62, fontSize }}>
        {lines.map((line, i) => {
          const lineStart = i * perLine;
          const o = interpolate(f, [lineStart, lineStart + 7], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const x = interpolate(f, [lineStart, lineStart + 7], [10, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const isH = hSet.has(i);
          const hp = isH ? interpolate(f, [highlightAt, highlightAt + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                opacity: o,
                transform: `translateX(${x}px)`,
                background: isH ? `${highlightColor}${Math.round(hp * 28).toString(16).padStart(2, "0")}` : "transparent",
                borderLeft: isH ? `2px solid ${highlightColor}${Math.round(hp * 255).toString(16).padStart(2, "0")}` : "2px solid transparent",
                margin: "0 -20px",
                padding: "0 18px",
                minHeight: fontSize * 1.62,
                whiteSpace: "pre",
              }}
            >
              {showLineNumbers && (
                <span style={{ width: 34, color: "rgba(255,255,255,0.18)", userSelect: "none", flexShrink: 0 }}>
                  {i + 1}
                </span>
              )}
              <span>{tokenize(line)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
