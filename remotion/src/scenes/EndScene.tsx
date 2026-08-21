import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { GOLD, CREAM } from "../theme";

const playfair = loadPlayfair("normal", { weights: ["600"], subsets: ["latin"] });
const inter = loadInter("normal", { weights: ["400", "600"], subsets: ["latin"] });

export const EndScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(enter, [0, 1], [0.94, 1]);
  const glow = interpolate(frame % 90, [0, 45, 90], [0.35, 0.7, 0.35]);
  const line = interpolate(frame, [8, 42], [0, 520], { extrapolateRight: "clamp" });
  const urlIn = interpolate(frame, [26, 50], [0, 1], { extrapolateRight: "clamp" });
  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [duration - 18, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#03050c",
        opacity: Math.min(fadeIn, fadeOut),
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 55% at 50% 50%, rgba(245,199,106,${
            0.16 * glow
          }) 0%, rgba(3,5,12,0) 70%)`,
        }}
      />
      <div style={{ transform: `scale(${scale})`, textAlign: "center" }}>
        <div
          style={{
            fontFamily: playfair.fontFamily,
            fontSize: 96,
            color: CREAM,
            fontWeight: 600,
            letterSpacing: -1,
          }}
        >
          AdTool <span style={{ color: GOLD }}>AI</span>
        </div>
        <div
          style={{
            width: line,
            height: 1,
            margin: "34px auto 0",
            background: `linear-gradient(90deg, rgba(245,199,106,0), ${GOLD}, rgba(245,199,106,0))`,
          }}
        />
        <div
          style={{
            opacity: urlIn,
            marginTop: 30,
            fontFamily: inter.fontFamily,
            fontSize: 26,
            letterSpacing: 5,
            color: "rgba(244,239,230,0.8)",
            textTransform: "uppercase",
          }}
        >
          useadtool.ai
        </div>
      </div>
    </AbsoluteFill>
  );
};
