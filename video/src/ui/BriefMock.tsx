import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { COLORS, FONT } from "../theme";
import { REAL_BRIEF } from "../realBrief";

// Recreates the full-width "morning read" editorial brief, populated with
// Rishik's ACTUAL brief content pulled live from GET /api/brief/latest.
// `scroll` (0..1) drives a slow auto-scroll so it reads like a real page.

const TAG_COLOR: Record<string, string> = {
  "pathology ai": COLORS.teal,
  "ai infra & chip verification": COLORS.lilac,
  "vc & accelerators": COLORS.amber,
  tech: COLORS.blueSoft,
  "markets & quant": COLORS.tealBright,
  jobs: COLORS.green,
  inbox: COLORS.blueSoft,
};
const tagColor = (t?: string) => (t && TAG_COLOR[t]) || COLORS.blueSoft;

export const BriefMock: React.FC<{ scroll?: number; width?: number }> = ({ scroll = 0, width = 760 }) => {
  const items = REAL_BRIEF.items;
  const lead = items[0];
  const rest = items.slice(1, 5);

  return (
    <div
      style={{
        width,
        transform: `translateY(${-scroll * 560}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 30,
        fontFamily: FONT.sans,
      }}
    >
      {/* masthead */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 13, letterSpacing: "0.26em", textTransform: "uppercase", color: COLORS.blueSoft }}>
          the morning read
        </span>
        <span style={{ height: 1, flex: 1, background: "linear-gradient(90deg, rgba(124,192,255,0.35), transparent)" }} />
        <span style={{ fontFamily: FONT.mono, fontSize: 12, color: COLORS.faint }}>fri · jun 13</span>
      </div>

      {/* topline with drop cap */}
      <p style={{ fontFamily: FONT.display, fontSize: 27, lineHeight: 1.5, color: "#e9eef6", margin: 0, letterSpacing: "-0.01em" }}>
        <span style={{ float: "left", fontSize: 78, lineHeight: 0.8, paddingRight: 12, color: COLORS.teal, fontWeight: 700 }}>
          {REAL_BRIEF.topline.charAt(0).toUpperCase()}
        </span>
        {REAL_BRIEF.topline.slice(1)}
      </p>

      {/* lead story */}
      {lead && (
        <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ height: 150, background: `linear-gradient(135deg, ${tagColor(lead.sourceTag)}33, rgba(6,7,11,0.2)), radial-gradient(circle at 30% 30%, ${tagColor(lead.sourceTag)}55, transparent 60%)`, position: "relative" }}>
            <span style={{ position: "absolute", top: 14, left: 16, fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: tagColor(lead.sourceTag), background: "rgba(6,7,11,0.55)", padding: "5px 11px", borderRadius: 8 }}>
              {lead.sourceTag}
            </span>
            <span style={{ position: "absolute", top: 14, right: 16, fontFamily: FONT.mono, fontSize: 12, color: COLORS.amber }}>
              score {lead.score?.toFixed(2)}
            </span>
          </div>
          <div style={{ padding: "20px 24px 24px" }}>
            <h2 style={{ fontFamily: FONT.display, fontSize: 28, fontWeight: 600, color: "#fff", margin: 0, lineHeight: 1.2 }}>{lead.title}</h2>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: COLORS.muted, marginTop: 12 }}>{lead.summary}</p>
            <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 12, borderLeft: `3px solid ${COLORS.blue}`, background: "rgba(20,136,252,0.07)" }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.blueSoft }}>why this matters to you</span>
              <p style={{ fontSize: 16.5, lineHeight: 1.55, color: "#dde4ee", margin: "6px 0 0" }}>{lead.whyItMatters}</p>
            </div>
          </div>
        </div>
      )}

      {/* secondary stories */}
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {rest.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 18, paddingBottom: 22, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ width: 110, height: 84, flexShrink: 0, borderRadius: 12, background: `radial-gradient(circle at 40% 30%, ${tagColor(it.sourceTag)}55, rgba(6,7,11,0.3))`, border: "1px solid rgba(255,255,255,0.07)" }} />
            <div style={{ minWidth: 0 }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: tagColor(it.sourceTag) }}>{it.sourceTag} · {it.score?.toFixed(2)}</span>
              <h3 style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 600, color: "#fff", margin: "5px 0 0", lineHeight: 1.25 }}>{it.title}</h3>
              <p style={{ fontSize: 15, lineHeight: 1.5, color: COLORS.muted, margin: "7px 0 0" }}>{it.whyItMatters}</p>
            </div>
          </div>
        ))}
      </div>

      {/* "what needs you" action band */}
      <div style={{ borderRadius: 18, padding: "22px 26px", background: "rgba(20,136,252,0.06)", border: "1px solid rgba(20,136,252,0.2)" }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase", color: COLORS.blueSoft, marginBottom: 14 }}>
          what needs you · {REAL_BRIEF.actionCount} actions
        </div>
        {REAL_BRIEF.actions.slice(0, 3).map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderTop: i ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
            <span style={{ fontFamily: FONT.mono, fontSize: 11, color: a.kind === "email" ? COLORS.teal : a.kind === "job" ? COLORS.green : COLORS.amber, border: `1px solid currentColor`, borderRadius: 6, padding: "3px 8px", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>
              {a.kind}
            </span>
            <span style={{ fontSize: 15.5, lineHeight: 1.45, color: COLORS.fg }}>
              {a.who && <b style={{ color: "#fff" }}>{a.who}{a.org ? `, ${a.org}` : ""} — </b>}
              {a.reason}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
