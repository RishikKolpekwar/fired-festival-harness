import React from "react";
import { Composition } from "remotion";
import { loadFont as loadGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";
import { loadFont as loadSans } from "@remotion/google-fonts/Geist";
import { SoloDemo } from "./SoloDemo";
import { TOTAL } from "./timeline";
import { FPS } from "./theme";

loadGrotesk();
loadMono();
loadSans();

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SoloDemo"
      component={SoloDemo}
      durationInFrames={TOTAL}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
