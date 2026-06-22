import { useEffect, type ReactNode } from "react";
import DirectorBar from "./DirectorBar";
import StageWelcomeMoment from "./StageWelcomeMoment";
import CinemascopeOverlay from "./CinemascopeOverlay";
import { useStageAudio } from "@/hooks/useStageAudio";
import { subscribePipelineEvents } from "@/lib/pipelineEvents";
import { emitStageEvent } from "@/lib/stage/stageEvents";

/**
 * MotionStudioStage — the Sound Stage shell that wraps the entire Motion
 * Studio (Video Composer). Provides the dark cinematic backdrop, the
 * Director's Bar, the one-shot welcome moment, the cinemascope letterbox,
 * and mounts the audio layer.
 *
 * This is purely additive: children remain the existing VideoComposerDashboard.
 */
export default function MotionStudioStage({ children }: { children: ReactNode }) {
  useStageAudio();

  return (
    <div className="relative min-h-screen text-foreground">
      {/* Stage Floor — deep black with radial gold spotlight from top-left */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 15% 0%, hsla(43, 90%, 68%, 0.08) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 85% 100%, hsla(187, 84%, 55%, 0.05) 0%, transparent 60%), #050816",
        }}
      />
      {/* Film grain layer — barely-there texture for cinematic depth */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.96 0 0 0 0 0.78 0 0 0 0 0.42 0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          backgroundSize: "200px 200px",
        }}
      />

      <DirectorBar />
      <StageWelcomeMoment />
      <CinemascopeOverlay />

      <div className="relative">{children}</div>
    </div>
  );
}
