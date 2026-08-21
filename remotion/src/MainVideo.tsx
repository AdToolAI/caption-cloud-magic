import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { TitleScene } from "./scenes/TitleScene";
import { EndScene } from "./scenes/EndScene";
import { UIScene } from "./components/UIScene";
import { Subtitles } from "./components/Subtitles";
import { SCENES } from "./theme";
import { COPY, Lang } from "./copy";

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

export const MainVideo: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const c = COPY[lang];
  const fadeOut = interpolate(frame, [896, 912], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#03050c", opacity: fadeOut }}>
      <Sequence from={SCENES.title.from} durationInFrames={SCENES.title.duration}>
        <TitleScene duration={SCENES.title.duration} lang={lang} />
      </Sequence>

      <Sequence from={SCENES.home.from} durationInFrames={SCENES.home.duration}>
        <UIScene
          image="studios.png"
          kicker={c.scenes.home.kicker}
          headline={c.scenes.home.headline}
          note={c.scenes.home.note}
          duration={SCENES.home.duration}
          origin="50% 34%"
          zoom={[1.02, 1.09]}
          side="right"
        />
      </Sequence>

      <Sequence from={SCENES.text.from} durationInFrames={SCENES.text.duration}>
        <UIScene
          image="text-studio.png"
          kicker={c.scenes.text.kicker}
          headline={c.scenes.text.headline}
          note={c.scenes.text.note}
          duration={SCENES.text.duration}
          origin="46% 26%"
          zoom={[1.08, 1.01]}
          side="left"
        />
      </Sequence>

      <Sequence from={SCENES.motion.from} durationInFrames={SCENES.motion.duration}>
        <UIScene
          image="motion-studio.png"
          kicker={c.scenes.motion.kicker}
          headline={c.scenes.motion.headline}
          note={c.scenes.motion.note}
          duration={SCENES.motion.duration}
          origin="42% 24%"
          zoom={[1.03, 1.12]}
          side="right"
        />
      </Sequence>

      <Sequence from={SCENES.video.from} durationInFrames={SCENES.video.duration}>
        <UIScene
          image="video-studio.png"
          kicker={c.scenes.video.kicker}
          headline={c.scenes.video.headline}
          note={c.scenes.video.note}
          duration={SCENES.video.duration}
          origin="52% 30%"
          zoom={[1.1, 1.02]}
          side="left"
        />
      </Sequence>

      <Sequence from={SCENES.library.from} durationInFrames={SCENES.library.duration}>
        <UIScene
          image="library.png"
          kicker={c.scenes.library.kicker}
          headline={c.scenes.library.headline}
          note={c.scenes.library.note}
          duration={SCENES.library.duration}
          origin="50% 58%"
          zoom={[1.02, 1.11]}
          side="right"
        />
      </Sequence>

      <Sequence from={SCENES.calendar.from} durationInFrames={SCENES.calendar.duration}>
        <UIScene
          image="calendar.png"
          kicker={c.scenes.calendar.kicker}
          headline={c.scenes.calendar.headline}
          note={c.scenes.calendar.note}
          duration={SCENES.calendar.duration}
          origin="48% 30%"
          zoom={[1.04, 1.12]}
          side="left"
        />
      </Sequence>

      <Sequence from={SCENES.analytics.from} durationInFrames={SCENES.analytics.duration}>
        <UIScene
          image="analytics.png"
          kicker={c.scenes.analytics.kicker}
          headline={c.scenes.analytics.headline}
          note={c.scenes.analytics.note}
          duration={SCENES.analytics.duration}
          origin="50% 20%"
          zoom={[1.08, 1.0]}
          side="right"
        />
      </Sequence>

      <Sequence from={SCENES.end.from} durationInFrames={SCENES.end.duration}>
        <EndScene duration={SCENES.end.duration} />
      </Sequence>

      <Subtitles lang={lang} />
      <Grain />
      <Letterbox />
    </AbsoluteFill>
  );
};
