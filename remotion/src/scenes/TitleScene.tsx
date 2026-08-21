import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { GOLD, CREAM } from "../theme";


const playfair = loadPlayfair("normal", { weights: ["600"], subsets: ["latin"] });
const inter = loadInter("normal", { weights: ["600"], subsets: ["latin"] });

export const TitleScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const rise = spring({ frame, fps, config: { damping: 200 } });
  const y = interpolate(rise, [0, 1], [46, 0]);
  const blur = interpolate(frame, [0, 26], [16, 0], { extrapolateRight: "clamp" });
  const sub = interpolate(frame, [18, 40], [0, 1], { extrapolateRight: "clamp" });
  const rule = interpolate(frame, [10, 46], [0, 420], { extrapolateRight: "clamp" });
  const out = interpolate(frame, [duration - 14, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const vidScale = interpolate(frame, [0, duration], [1.04, 1.12]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#03050c", opacity: out }}>
      <AbsoluteFill style={{ transform: `scale(${vidScale})`, opacity: 0.62 }}>
        <Img
          src={staticFile(
            `intro/f${String(Math.min(frame + 1, 90)).padStart(3, "0")}.jpg`,
          )}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background:
            "radial-gradient(90% 70% at 50% 50%, rgba(3,5,12,0.25) 0%, rgba(3,5,12,0.9) 100%)",
        }}
      />
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}
      >
        <div style={{ transform: `translateY(${y}px)`, filter: `blur(${blur}px)` }}>
          <div
            style={{
              fontFamily: inter.fontFamily,
              fontSize: 19,
              letterSpacing: 9,
              color: GOLD,
              textTransform: "uppercase",
              marginBottom: 26,
            }}
          >
            AdTool AI
          </div>
          <div
            style={{
              fontFamily: playfair.fontFamily,
              fontSize: 108,
              lineHeight: 1.02,
              color: CREAM,
              fontWeight: 600,
            }}
          >
            One creator.
            <br />
            <span style={{ color: GOLD }}>A whole studio.</span>
          </div>
        </div>
        <div
          style={{
            width: rule,
            height: 1,
            marginTop: 40,
            background: `linear-gradient(90deg, rgba(245,199,106,0), ${GOLD}, rgba(245,199,106,0))`,
          }}
        />
        <div
          style={{
            opacity: sub,
            marginTop: 26,
            fontFamily: inter.fontFamily,
            fontSize: 22,
            letterSpacing: 3,
            color: "rgba(244,239,230,0.72)",
          }}
        >
          Idea → script → video → publishing
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
