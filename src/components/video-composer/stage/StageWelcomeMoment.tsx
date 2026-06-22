import { useEffect, useState } from "react";
import { emitStageEvent } from "@/lib/stage/stageEvents";

const SESSION_KEY = "motion-studio:welcomed-this-session";

/**
 * One-shot cinematic welcome — SVG clapper snaps shut, "Take 01" caption
 * fades, then everything dissolves into the studio floor. Only plays once
 * per tab session.
 */
export default function StageWelcomeMoment() {
  const [phase, setPhase] = useState<"hidden" | "playing" | "fading" | "done">("hidden");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(SESSION_KEY)) {
        setPhase("done");
        return;
      }
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* no-op */
    }
    setPhase("playing");
    const t1 = window.setTimeout(() => {
      emitStageEvent("welcome");
    }, 280);
    const t2 = window.setTimeout(() => setPhase("fading"), 950);
    const t3 = window.setTimeout(() => setPhase("done"), 1500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, []);

  if (phase === "done" || phase === "hidden") return null;

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-[#050816] transition-opacity duration-500 ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
      aria-hidden
    >
      {/* Spotlight */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, hsla(43, 90%, 68%, 0.18) 0%, transparent 55%)",
        }}
      />
      {/* Clapper */}
      <div className="relative flex flex-col items-center gap-6">
        <svg
          width="220"
          height="180"
          viewBox="0 0 220 180"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-[0_0_30px_hsla(43,90%,68%,0.35)]"
        >
          {/* Body */}
          <rect x="20" y="70" width="180" height="95" rx="6" fill="#0b1120" stroke="#F5C76A" strokeWidth="2" />
          {/* Top arm (animated) */}
          <g
            style={{
              transformOrigin: "30px 70px",
              animation: "clapperSnap 700ms cubic-bezier(0.55, 0.05, 0.25, 1.5) forwards",
            }}
          >
            <rect x="20" y="58" width="180" height="22" rx="4" fill="#0b1120" stroke="#F5C76A" strokeWidth="2" />
            {/* Diagonal stripes */}
            <path d="M30 58 L50 80 M60 58 L80 80 M90 58 L110 80 M120 58 L140 80 M150 58 L170 80 M180 58 L195 75" stroke="#F5C76A" strokeWidth="2" />
          </g>
          {/* "MOTION STUDIO · TAKE 01" text */}
          <text x="110" y="115" textAnchor="middle" fill="#F5C76A" fontSize="11" fontFamily="ui-monospace, monospace" letterSpacing="3">
            MOTION STUDIO
          </text>
          <text x="110" y="140" textAnchor="middle" fill="#F5C76A" fontSize="20" fontFamily="Playfair Display, serif" fontStyle="italic">
            Take 01
          </text>
          <text x="110" y="158" textAnchor="middle" fill="#F5C76A" fontSize="8" fontFamily="ui-monospace, monospace" letterSpacing="2" opacity="0.6">
            ROLL · SOUND · ACTION
          </text>
        </svg>
      </div>
      <style>{`
        @keyframes clapperSnap {
          0%   { transform: rotate(-32deg); }
          55%  { transform: rotate(2deg); }
          75%  { transform: rotate(-3deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
