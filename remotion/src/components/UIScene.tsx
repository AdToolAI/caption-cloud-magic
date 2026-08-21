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
const inter = loadInter("normal", { weights: ["400", "600"], subsets: ["latin"] });

type Props = {
  image: string;
  kicker: string;
  headline: string;
  note?: string;
  duration: number;
  origin?: string;
  zoom?: [number, number];
  side?: "right" | "left";
};

export const UIScene: React.FC<Props> = ({
  image,
  kicker,
  headline,
  note,
  duration,
  origin = "50% 30%",
  zoom = [1.06, 1.15],
  side = "right",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = interpolate(frame, [0, duration], zoom, { extrapolateRight: "clamp" });

  const fadeIn = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [duration - 12, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const panelSpring = spring({ frame, fps, config: { damping: 200 } });
  const panelX = interpolate(panelSpring, [0, 1], [side === "right" ? 90 : -90, 0]);
  const panelOp = interpolate(frame, [2, 22], [0, 1], { extrapolateRight: "clamp" });

  const textX = interpolate(
    spring({ frame: frame - 6, fps, config: { damping: 200 } }),
    [0, 1],
    [side === "right" ? -50 : 50, 0],
  );
  const textOp = interpolate(frame, [8, 30], [0, 1], { extrapolateRight: "clamp" });
  const lineW = interpolate(frame, [16, 48], [0, 84], { extrapolateRight: "clamp" });
  const noteOp = interpolate(frame, [26, 48], [0, 1], { extrapolateRight: "clamp" });

  const panelLeft = side === "right" ? 660 : 96;
  const textLeft = side === "right" ? 96 : 1290;

  return (
    <AbsoluteFill style={{ backgroundColor: "#04060f", opacity }}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(70% 80% at 78% 42%, rgba(245,199,106,0.10) 0%, rgba(4,6,15,0) 60%), radial-gradient(60% 70% at 12% 70%, rgba(127,212,232,0.07) 0%, rgba(4,6,15,0) 65%), linear-gradient(160deg, #060a16 0%, #03050c 60%, #05070f 100%)",
        }}
      />

      {/* screenshot panel */}
      <div
        style={{
          position: "absolute",
          left: panelLeft,
          top: 152,
          width: 1164,
          height: 776,
          borderRadius: 20,
          overflow: "hidden",
          border: "1px solid rgba(245,199,106,0.26)",
          boxShadow:
            "0 60px 140px rgba(0,0,0,0.85), 0 0 0 10px rgba(255,255,255,0.02), 0 0 90px rgba(245,199,106,0.08)",
          transform: `translateX(${panelX}px)`,
          opacity: panelOp,
          background: "#05070f",
        }}
      >
        <Img
          src={staticFile(`images/${image}`)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
            transformOrigin: origin,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(4,6,15,0.18) 0%, rgba(4,6,15,0) 30%, rgba(4,6,15,0.55) 100%)",
          }}
        />
      </div>

      {/* text column */}
      <div
        style={{
          position: "absolute",
          left: textLeft,
          top: 300,
          width: 534,
          transform: `translateX(${textX}px)`,
          opacity: textOp,
        }}
      >
        <div
          style={{
            fontFamily: inter.fontFamily,
            fontSize: 18,
            letterSpacing: 5.5,
            textTransform: "uppercase",
            color: GOLD,
            fontWeight: 600,
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            width: lineW,
            height: 2,
            background: `linear-gradient(90deg, ${GOLD}, rgba(245,199,106,0))`,
            margin: "20px 0 22px 0",
          }}
        />
        <div
          style={{
            fontFamily: playfair.fontFamily,
            fontSize: 62,
            lineHeight: 1.06,
            color: CREAM,
            fontWeight: 600,
          }}
        >
          {headline}
        </div>
        {note ? (
          <div
            style={{
              opacity: noteOp,
              marginTop: 24,
              fontFamily: inter.fontFamily,
              fontSize: 22,
              lineHeight: 1.45,
              color: "rgba(244,239,230,0.62)",
            }}
          >
            {note}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
