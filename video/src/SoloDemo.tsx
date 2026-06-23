import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { Aurora } from "./Aurora";
import { RubricRail } from "./components/RubricRail";
import { SCENES } from "./timeline";
import { ColdOpen, Idea, Architecture, Material } from "./scenes/part1";
import { Guardrails, Checkpoints, Alarms } from "./scenes/part2";
import { Human, Swap, Payoff, Close } from "./scenes/part3";

export const SoloDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#06070b" }}>
      <Aurora />
      <Series>
        <Series.Sequence durationInFrames={SCENES.coldOpen}><ColdOpen /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.idea}><Idea /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.architecture}><Architecture /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.material}><Material /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.guardrails}><Guardrails /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.checkpoints}><Checkpoints /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.alarms}><Alarms /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.human}><Human /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.swap}><Swap /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.payoff}><Payoff /></Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.close}><Close /></Series.Sequence>
      </Series>
      {/* persistent rubric scoreboard — sees the GLOBAL frame */}
      <RubricRail />
    </AbsoluteFill>
  );
};
