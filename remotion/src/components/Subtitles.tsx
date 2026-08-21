import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { SUBTITLES } from "../theme";

const inter = loadInter("normal", { weights: ["500"], subsets: ["latin"] });

export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const active = SUBTITLES.find((s) => frame >= s.from - 6 && frame <= s.to + 8);
  if (!active) return null;

  const opacity = interpolate(
    frame,
    [active.from - 6, active.from + 4, active.to, active.to + 8],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 74 }}
    >
      <div
        style={{
          opacity,
          maxWidth: 1320,
          textAlign: "center",
          fontFamily: inter.fontFamily,
          fontSize: 34,
          lineHeight: 1.3,
          fontWeight: 500,
          color: "#F4EFE6",
          textShadow: "0 6px 30px rgba(0,0,0,0.95)",
        }}
      >
        {active.text}
      </div>
    </AbsoluteFill>
  );
};
