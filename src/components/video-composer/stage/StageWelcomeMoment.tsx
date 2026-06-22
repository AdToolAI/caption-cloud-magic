import { useCallback, useEffect, useMemo, useState } from "react";
import { emitStageEvent } from "@/lib/stage/stageEvents";
import StageCountdown from "./StageCountdown";

const SESSION_KEY = "motion-studio:welcomed-this-session";

/**
 * Cinematic welcome sequence (~3.8s). 5 beats:
 *   0.0s  black + gold particles drifting
 *   0.6s  letterbox bars slide in (2.39:1, gold hairline)
 *   1.0s  clapper SVG snaps shut + ACTION cue
 *   1.4s  "ADTOOL AI" wordmark fades up with gold sweep
 *   2.0s  "MOTION STUDIO" mono sub-line types in
 *   2.6s  tagline fades in
 *   3.2s  iris-open reveals the briefing
 *   3.8s  overlay removed, ambient hush begins
 *
 * - Once per browser tab session (sessionStorage).
 * - Skippable via "Skip Intro" pill, ESC, or click.
 * - prefers-reduced-motion collapses to a 400ms fade.
 */
export default function StageWelcomeMoment() {
  const [phase, setPhase] = useState<"hidden" | "playing" | "countdown" | "iris" | "done">("hidden");
  const [skipped, setSkipped] = useState(false);

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true,
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Note: intentionally NO sessionStorage gate — the cinematic welcome
    // should replay every time the user enters the Motion Studio so it
    // feels like stepping onto a sound stage anew.
    void SESSION_KEY;
    setPhase("playing");

    if (reducedMotion) {
      const t = window.setTimeout(() => setPhase("done"), 400);
      return () => window.clearTimeout(t);
    }

    const timers: number[] = [];
    timers.push(window.setTimeout(() => emitStageEvent("action"), 1000));
    // Welcome beats finish ~3.2s; let tagline settle, then roll into countdown.
    timers.push(window.setTimeout(() => setPhase("countdown"), 3400));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reducedMotion]);

  useEffect(() => {
    if (phase === "hidden" || phase === "done") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleSkip = () => {
    if (skipped) return;
    setSkipped(true);
    setPhase("iris");
    window.setTimeout(() => setPhase("done"), 500);
  };

  const handleCountdownComplete = useCallback(() => {
    setPhase("iris");
    window.setTimeout(() => setPhase("done"), 600);
  }, []);


  if (phase === "done" || phase === "hidden") return null;

  // Stable particle field
  const particles = Array.from({ length: 28 }, (_, i) => {
    const left = (i * 37) % 100;
    const top = (i * 53) % 100;
    const delay = (i % 8) * 0.18;
    const dur = 5 + ((i * 7) % 6);
    const size = 1 + (i % 3);
    return { left, top, delay, dur, size, i };
  });

  const irisActive = phase === "iris";

  return (
    <div
      role="dialog"
      aria-label="Welcome to AdTool AI Motion Studio"
      onClick={handleSkip}
      className="fixed inset-0 z-[80] overflow-hidden bg-[#050816] cursor-pointer select-none"

      style={{
        clipPath: irisActive ? "circle(160% at 50% 50%)" : "circle(150% at 50% 50%)",
        transition: irisActive
          ? "clip-path 600ms cubic-bezier(0.76, 0, 0.24, 1), opacity 600ms ease-out"
          : undefined,
        opacity: irisActive ? 0 : 1,
        animation: reducedMotion ? "stageWelcomeFade 400ms ease-out forwards" : undefined,
      }}
    >
      {/* Vignette + spotlight */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 45% at 50% 50%, hsla(43,90%,68%,0.18) 0%, transparent 60%), radial-gradient(ellipse 100% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* Drifting gold particles */}
      {!reducedMotion && (
        <div aria-hidden className="absolute inset-0">
          {particles.map((p) => (
            <span
              key={p.i}
              className="absolute rounded-full"
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                width: p.size,
                height: p.size,
                background: "hsla(43, 90%, 68%, 0.85)",
                boxShadow: "0 0 6px hsla(43,90%,68%,0.6)",
                animation: `stageParticleDrift ${p.dur}s ease-in-out ${p.delay}s infinite`,
                opacity: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* Letterbox bars (2.39:1) */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{
          height: "18%",
          background: "linear-gradient(to bottom, #000 0%, #000 92%, hsla(43,90%,68%,0.5) 96%, transparent 100%)",
          transform: reducedMotion ? "translateY(0)" : "translateY(-100%)",
          animation: reducedMotion
            ? undefined
            : "stageBarSlideIn 700ms cubic-bezier(0.76,0,0.24,1) 600ms forwards",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "18%",
          background: "linear-gradient(to top, #000 0%, #000 92%, hsla(43,90%,68%,0.5) 96%, transparent 100%)",
          transform: reducedMotion ? "translateY(0)" : "translateY(100%)",
          animation: reducedMotion
            ? undefined
            : "stageBarSlideInBottom 700ms cubic-bezier(0.76,0,0.24,1) 600ms forwards",
        }}
      />

      {/* Center stage content */}
      <div className="relative h-full w-full flex flex-col items-center justify-center px-6">
        {/* Clapper */}
        <div
          className="mb-10"
          style={{
            opacity: reducedMotion ? 1 : 0,
            animation: reducedMotion
              ? undefined
              : "stageWelcomeFade 350ms ease-out 800ms forwards",
          }}
        >
          <svg
            width="180"
            height="148"
            viewBox="0 0 220 180"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-[0_0_40px_hsla(43,90%,68%,0.4)]"
          >
            <rect x="20" y="70" width="180" height="95" rx="6" fill="#0b1120" stroke="#F5C76A" strokeWidth="2" />
            <g
              style={{
                transformOrigin: "30px 70px",
                animation: reducedMotion
                  ? undefined
                  : "clapperSnap 650ms cubic-bezier(0.55,0.05,0.25,1.5) 1000ms forwards",
                transform: reducedMotion ? "rotate(0deg)" : "rotate(-32deg)",
              }}
            >
              <rect x="20" y="58" width="180" height="22" rx="4" fill="#0b1120" stroke="#F5C76A" strokeWidth="2" />
              <path
                d="M30 58 L50 80 M60 58 L80 80 M90 58 L110 80 M120 58 L140 80 M150 58 L170 80 M180 58 L195 75"
                stroke="#F5C76A"
                strokeWidth="2"
              />
            </g>
            <text x="110" y="118" textAnchor="middle" fill="#F5C76A" fontSize="10" fontFamily="ui-monospace, monospace" letterSpacing="3" opacity="0.8">
              SCENE 01 · TAKE 01
            </text>
            <text x="110" y="148" textAnchor="middle" fill="#F5C76A" fontSize="11" fontFamily="ui-monospace, monospace" letterSpacing="2" opacity="0.55">
              ROLL · SOUND · ACTION
            </text>
          </svg>
        </div>

        {/* Wordmark */}
        <div className="relative overflow-hidden">
          <h1
            className="text-5xl md:text-7xl tracking-[0.08em] font-light text-center"
            style={{
              fontFamily: "'Playfair Display', serif",
              backgroundImage:
                "linear-gradient(90deg, #b78934 0%, #F5C76A 35%, #FFF1C7 50%, #F5C76A 65%, #b78934 100%)",
              backgroundSize: "200% 100%",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              opacity: reducedMotion ? 1 : 0,
              animation: reducedMotion
                ? undefined
                : "stageWordmarkIn 700ms cubic-bezier(0.2,0.7,0.2,1) 1400ms forwards, stageWordmarkSweep 2200ms ease-in-out 1500ms",
            }}
          >
            AdTool&nbsp;AI
          </h1>
        </div>

        {/* Subline */}
        <div
          className="mt-3 text-xs md:text-sm tracking-[0.5em] uppercase text-amber-200/80"
          style={{
            fontFamily: "ui-monospace, monospace",
            opacity: reducedMotion ? 1 : 0,
            animation: reducedMotion
              ? undefined
              : "stageWelcomeFade 600ms ease-out 2000ms forwards",
          }}
        >
          Motion Studio
        </div>

        {/* Tagline */}
        <div
          className="mt-8 text-sm md:text-base text-amber-100/50 italic text-center max-w-md"
          style={{
            fontFamily: "'Playfair Display', serif",
            opacity: reducedMotion ? 1 : 0,
            animation: reducedMotion
              ? undefined
              : "stageWelcomeFade 800ms ease-out 2600ms forwards",
          }}
        >
          Where stories become cinema.
        </div>

        {/* Hairline */}
        <div
          aria-hidden
          className="mt-10 h-px w-0"
          style={{
            background: "linear-gradient(90deg, transparent, hsla(43,90%,68%,0.7), transparent)",
            animation: reducedMotion
              ? undefined
              : "stageHairlineGrow 900ms cubic-bezier(0.76,0,0.24,1) 1800ms forwards",
          }}
        />
      </div>

      {/* Skip button */}
      {!reducedMotion && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleSkip();
          }}
          className="absolute bottom-6 right-6 px-4 py-1.5 text-[10px] uppercase tracking-[0.3em] rounded-full border border-amber-200/30 text-amber-100/70 hover:text-amber-100 hover:border-amber-200/60 backdrop-blur-sm transition-colors"
          style={{
            opacity: 0,
            animation: "stageWelcomeFade 400ms ease-out 800ms forwards",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          Skip Intro · ESC
        </button>
      )}

      <style>{`
        @keyframes clapperSnap {
          0%   { transform: rotate(-32deg); }
          55%  { transform: rotate(2deg); }
          75%  { transform: rotate(-3deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes stageWelcomeFade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes stageWordmarkIn {
          from { opacity: 0; transform: translateY(18px) scale(0.98); letter-spacing: 0.18em; }
          to   { opacity: 1; transform: translateY(0) scale(1); letter-spacing: 0.08em; }
        }
        @keyframes stageWordmarkSweep {
          0%   { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        @keyframes stageBarSlideIn {
          to { transform: translateY(0); }
        }
        @keyframes stageBarSlideInBottom {
          to { transform: translateY(0); }
        }
        @keyframes stageHairlineGrow {
          from { width: 0; opacity: 0; }
          to   { width: 220px; opacity: 1; }
        }
        @keyframes stageParticleDrift {
          0%   { transform: translate3d(0,0,0) scale(0.6); opacity: 0; }
          20%  { opacity: 0.9; }
          80%  { opacity: 0.6; }
          100% { transform: translate3d(20px,-60px,0) scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
