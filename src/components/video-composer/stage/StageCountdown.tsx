import { useEffect, useMemo, useState } from "react";

interface StageCountdownProps {
  onComplete: () => void;
  reducedMotion?: boolean;
}

/**
 * Academy Leader 3-2-1 countdown. ~3.6s total:
 *   0ms     dial fades in (scale 0.92 → 1)
 *   200ms   "3" pop, sweep starts 1s rotation
 *   1200ms  "3" out, "2" in, sweep restarts
 *   2200ms  "2" out, "1" in, sweep restarts
 *   3200ms  "1" out, white flash (200ms)
 *   3400ms  collapse, onComplete()
 */
export default function StageCountdown({ onComplete, reducedMotion = false }: StageCountdownProps) {
  const [digit, setDigit] = useState<3 | 2 | 1 | 0>(3);
  const [flash, setFlash] = useState(false);
  const [outro, setOutro] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      const t = window.setTimeout(onComplete, 400);
      return () => window.clearTimeout(t);
    }
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setDigit(2), 1200));
    timers.push(window.setTimeout(() => setDigit(1), 2200));
    timers.push(window.setTimeout(() => setDigit(0), 3200));
    timers.push(window.setTimeout(() => setFlash(true), 3200));
    timers.push(window.setTimeout(() => setOutro(true), 3400));
    timers.push(window.setTimeout(onComplete, 3600));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reducedMotion, onComplete]);

  const ticks = useMemo(() => Array.from({ length: 12 }, (_, i) => i), []);

  if (reducedMotion) {
    return (
      <div className="flex items-center justify-center gap-8" style={{ animation: "stageWelcomeFade 300ms ease-out forwards" }}>
        {[3, 2, 1].map((n) => (
          <span
            key={n}
            className="text-6xl font-light text-amber-100/80"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {n}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className="relative flex items-center justify-center"
      style={{
        width: 280,
        height: 280,
        animation: outro
          ? "countdownCollapse 200ms ease-in forwards"
          : "countdownDialIn 320ms cubic-bezier(0.2,0.7,0.2,1) forwards",
      }}
    >
      {/* Outer vignette ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(5,5,5,0.95) 55%, rgba(5,5,5,0.6) 70%, transparent 80%)",
          boxShadow:
            "0 0 80px rgba(0,0,0,0.9), inset 0 0 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(245,199,106,0.25)",
        }}
      />

      {/* Concentric film-leader rings */}
      <div
        className="absolute rounded-full"
        style={{
          inset: 18,
          border: "1px solid rgba(245,199,106,0.15)",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          inset: 38,
          border: "1px solid rgba(245,199,106,0.10)",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          inset: 62,
          border: "1px solid rgba(245,199,106,0.08)",
        }}
      />

      {/* Diagonal academy cross (✕) — the iconic leader mark */}
      <svg
        className="absolute inset-0"
        viewBox="0 0 280 280"
        style={{ opacity: 0.09 }}
      >
        <line x1="20" y1="20" x2="260" y2="260" stroke="#F5C76A" strokeWidth="1.5" />
        <line x1="260" y1="20" x2="20" y2="260" stroke="#F5C76A" strokeWidth="1.5" />
        <line x1="140" y1="10" x2="140" y2="270" stroke="#F5C76A" strokeWidth="1" />
        <line x1="10" y1="140" x2="270" y2="140" stroke="#F5C76A" strokeWidth="1" />
      </svg>

      {/* 12 tick markers around the dial */}
      {ticks.map((i) => {
        const angle = (i * 30 * Math.PI) / 180;
        const cx = 140 + Math.sin(angle) * 122;
        const cy = 140 - Math.cos(angle) * 122;
        const isMajor = i % 3 === 0;
        return (
          <span
            key={i}
            className="absolute"
            style={{
              left: cx - 1,
              top: cy - (isMajor ? 8 : 5),
              width: 2,
              height: isMajor ? 16 : 10,
              background: "rgba(245,199,106,0.55)",
              transform: `rotate(${i * 30}deg)`,
              transformOrigin: "center",
              boxShadow: isMajor ? "0 0 6px rgba(245,199,106,0.5)" : undefined,
            }}
          />
        );
      })}

      {/* Sweep hand — rotates once per second, restarts on each digit via key */}
      <div
        key={digit}
        className="absolute inset-0 pointer-events-none"
        style={{
          animation: digit > 0 ? "countdownSweep 1s linear forwards" : undefined,
        }}
      >
        <div
          className="absolute"
          style={{
            left: "50%",
            top: "50%",
            width: 2,
            height: 118,
            marginLeft: -1,
            marginTop: -118,
            transformOrigin: "1px 118px",
            background:
              "linear-gradient(to top, transparent 0%, rgba(245,199,106,0.95) 60%, #FFF1C7 100%)",
            boxShadow: "0 0 12px rgba(245,199,106,0.8)",
            borderRadius: 2,
          }}
        />
        {/* Sweep arc trailing */}
        <div
          className="absolute rounded-full"
          style={{
            inset: 14,
            background:
              "conic-gradient(from 0deg, rgba(245,199,106,0.0) 0%, rgba(245,199,106,0.08) 40%, rgba(245,199,106,0.18) 95%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(circle, transparent 56%, #000 58%, #000 88%, transparent 92%)",
            maskImage:
              "radial-gradient(circle, transparent 56%, #000 58%, #000 88%, transparent 92%)",
          }}
        />
      </div>

      {/* Center hub */}
      <div
        className="absolute rounded-full"
        style={{
          width: 14,
          height: 14,
          background: "#F5C76A",
          boxShadow: "0 0 14px rgba(245,199,106,0.8), inset 0 0 4px rgba(0,0,0,0.5)",
        }}
      />

      {/* The digit */}
      {digit > 0 && (
        <span
          key={`digit-${digit}`}
          className="absolute text-center"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 168,
            lineHeight: 1,
            fontWeight: 300,
            color: "#F4ECD8",
            textShadow:
              "0 0 24px rgba(245,199,106,0.5), 0 2px 0 rgba(0,0,0,0.6)",
            animation:
              "countdownDigitIn 220ms cubic-bezier(0.2,0.7,0.2,1) forwards, countdownDigitOut 280ms ease-in 920ms forwards",
            mixBlendMode: "screen",
          }}
        >
          {digit}
        </span>
      )}

      {/* Film grain overlay */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 0.92  0 0 0 0 0.74  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
          mixBlendMode: "overlay",
          opacity: 0.35,
          animation: "countdownGrain 0.18s steps(3) infinite",
        }}
      />

      {/* Outer subtle scratches */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(92deg, transparent 0 38px, rgba(245,199,106,0.04) 38px 39px, transparent 39px 80px)",
          mixBlendMode: "screen",
        }}
      />

      {/* White flash on "1" → 0 */}
      {flash && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(circle at 50% 50%, #FFF8E1 0%, #FFE9A8 35%, transparent 75%)",
            animation: "countdownFlash 360ms ease-out forwards",
            zIndex: 90,
          }}
        />
      )}

      <style>{`
        @keyframes countdownDialIn {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes countdownCollapse {
          from { opacity: 1; transform: scale(1); filter: blur(0); }
          to   { opacity: 0; transform: scale(1.08); filter: blur(6px); }
        }
        @keyframes countdownSweep {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes countdownDigitIn {
          from { opacity: 0; transform: scale(0.4); filter: blur(18px); }
          to   { opacity: 1; transform: scale(1); filter: blur(0); }
        }
        @keyframes countdownDigitOut {
          from { opacity: 1; transform: scale(1); filter: blur(0); }
          to   { opacity: 0; transform: scale(1.9); filter: blur(14px); }
        }
        @keyframes countdownGrain {
          0%   { transform: translate(0, 0); }
          33%  { transform: translate(-4px, 3px); }
          66%  { transform: translate(3px, -2px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes countdownFlash {
          0%   { opacity: 0; }
          25%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
