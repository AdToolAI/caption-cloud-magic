import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { TitleScene } from "./scenes/TitleScene";
import { EndScene } from "./scenes/EndScene";
import { UIScene } from "./components/UIScene";
import { Subtitles } from "./components/Subtitles";
import { SCENES } from "./theme";

const Grain: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      opacity: 0.055,
      backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/></filter><rect width='140' height='140' filter='url(%23n)' opacity='0.7'/></svg>\")",
    }}
  />
);

const Letterbox: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <div
      style={{ position: "absolute", top: 0, left: 0, right: 0, height: 46, background: "#000" }}
    />
    <div
      style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 46, background: "#000" }}
    />
  </AbsoluteFill>
);

export const MainVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [896, 912], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#03050c", opacity: fadeOut }}>
      <Sequence from={SCENES.title.from} durationInFrames={SCENES.title.duration}>
        <TitleScene duration={SCENES.title.duration} />
      </Sequence>

      <Sequence from={SCENES.home.from} durationInFrames={SCENES.home.duration}>
        <UIScene
          image="studios.png"
          kicker="Six studios · one login"
          headline="Every model. One workflow."
          note="Video, image, voice, music and cast — under one roof."
          duration={SCENES.home.duration}
          origin="50% 34%"
          zoom={[1.02, 1.09]}
          side="right"
        />
      </Sequence>

      <Sequence from={SCENES.text.from} durationInFrames={SCENES.text.duration}>
        <UIScene
          image="text-studio.png"
          kicker="AI Text Studio"
          headline="Copy that sounds like you."
          note="Premium reasoning models in three quality tiers."
          duration={SCENES.text.duration}
          origin="46% 26%"
          zoom={[1.08, 1.01]}
          side="left"
        />
      </Sequence>

      <Sequence from={SCENES.motion.from} durationInFrames={SCENES.motion.duration}>
        <UIScene
          image="motion-studio.png"
          kicker="Motion Studio"
          headline="Your director's cockpit."
          note="Cast → location → storyboard → render."
          duration={SCENES.motion.duration}
          origin="42% 24%"
          zoom={[1.03, 1.12]}
          side="right"
        />
      </Sequence>

      <Sequence from={SCENES.video.from} durationInFrames={SCENES.video.duration}>
        <UIScene
          image="video-studio.png"
          kicker="AI Video Studio"
          headline="Seedance, Veo, Kling — one prompt bar."
          note="Switch engines without leaving the canvas."
          duration={SCENES.video.duration}
          origin="52% 30%"
          zoom={[1.1, 1.02]}
          side="left"
        />
      </Sequence>

      <Sequence from={SCENES.library.from} durationInFrames={SCENES.library.duration}>
        <UIScene
          image="library.png"
          kicker="Cast &amp; World"
          headline="Characters that stay consistent."
          note="Persistent identity across every scene."
          duration={SCENES.library.duration}
          origin="50% 58%"
          zoom={[1.02, 1.11]}
          side="right"
        />
      </Sequence>

      <Sequence from={SCENES.calendar.from} durationInFrames={SCENES.calendar.duration}>
        <UIScene
          image="calendar.png"
          kicker="Command Center"
          headline="Plan, schedule, publish."
          note="Every platform from a single calendar."
          duration={SCENES.calendar.duration}
          origin="48% 30%"
          zoom={[1.04, 1.12]}
          side="left"
        />
      </Sequence>

      <Sequence from={SCENES.analytics.from} durationInFrames={SCENES.analytics.duration}>
        <UIScene
          image="analytics.png"
          kicker="Analytics"
          headline="See what actually performs."
          note="Reach, engagement and top content in one view."
          duration={SCENES.analytics.duration}
          origin="50% 20%"
          zoom={[1.08, 1.0]}
          side="right"
        />
      </Sequence>

      <Sequence from={SCENES.end.from} durationInFrames={SCENES.end.duration}>
        <EndScene duration={SCENES.end.duration} />
      </Sequence>

      <Subtitles />
      <Grain />
      <Letterbox />
    </AbsoluteFill>
  );
};
