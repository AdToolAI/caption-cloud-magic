import { useEffect, useMemo, useState } from "react";

interface StageCountdownProps {
  onComplete: () => void;
  reducedMotion?: boolean;
}

/**
 * 1920s hand-cranked silent film countdown leader.
 * Sepia-toned, stepped/jittery animation, heavy flicker, splice-lines, scratches.
 * Uneven beat timing (3=1100ms, 2=950ms, 1=1050ms) like a hand-crank operator.
 */
export default function StageCountdown({ onComplete, reducedMotion = false }: StageCountdownProps) {
  const [digit, setDigit] = useState<3 | 2 | 1 | 0>(3);
  const [flash, setFlash] = useState(false);
  const [splice, setSplice] = useState(0); // increments to retrigger splice anim
  const [cigBurn, setCigBurn] = useState(false);
  const [outro, setOutro] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      const t = window.setTimeout(onComplete, 400);
      return () => window.clearTimeout(t);
    }
    const timers: number[] = [];
    // 3 → 2 at 1100ms
    timers.push(window.setTimeout(() => { setDigit(2); setSplice((s) => s + 1); setCigBurn(true); window.setTimeout(() => setCigBurn(false), 140); }, 1100));
    // 2 → 1 at 2050ms (950ms beat)
    timers.push(window.setTimeout(() => { setDigit(1); setSplice((s) => s + 1); setCigBurn(true); window.setTimeout(() => setCigBurn(false), 140); }, 2050));
    // 1 → 0 at 3100ms (1050ms beat)
    timers.push(window.setTimeout(() => setDigit(0), 3100));
    timers.push(window.setTimeout(() => setFlash(true), 3100));
    timers.push(window.setTimeout(() => setOutro(true), 3300));
    timers.push(window.setTimeout(onComplete, 3500));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reducedMotion, onComplete]);

  // Stable dust/scratch positions
  const dust = useMemo(
    () => Array.from({ length: 6 }, (_, i) => ({
      left: (i * 53 + 17) % 90 + 5,
      top: (i * 71 + 23) % 90 + 5,
      size: 1 + (i % 3),
      delay: (i * 0.13) % 0.6,
    })),
    [],
  );
  const scratches = useMemo(
    () => Array.from({ length: 3 }, (_, i) => ({
      left: 15 + (i * 31) % 70,
      delay: i * 0.4,
      dur: 0.3 + (i * 0.07),
    })),
    [],
  );

  if (reducedMotion) {
    return (
      <div className="flex items-center justify-center gap-8" style={{ animation: "stageWelcomeFade 300ms ease-out forwards" }}>
        {[3, 2, 1].map((n) => (
          <span
            key={n}
            className="text-6xl font-light"
            style={{ fontFamily: "'Playfair Display', serif", color: "#1a1410" }}
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
        width: 320,
        height: 320,
        animation: outro
          ? "vintageOutro 200ms ease-in forwards"
          : "vintageDialIn 280ms steps(4) forwards, vintageJitter 0.4s steps(2) 280ms infinite, vintageFlicker 0.14s steps(3) 280ms infinite",
      }}
    >
      {/* Aged cream disc — the bright leader film */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 42% 38%, #f0e3c8 0%, #e8dcc4 45%, #d4c19a 75%, #a67c52 96%, #6b4a2a 100%)",
          boxShadow:
            "0 0 60px rgba(0,0,0,0.85), inset 0 0 80px rgba(107,74,42,0.55), inset 0 0 24px rgba(26,20,16,0.35), 0 0 0 1px rgba(60,40,20,0.6)",
        }}
      />

      {/* Heavy round vignette (old lens) */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 50%, rgba(26,20,16,0.35) 78%, rgba(26,20,16,0.85) 100%)",
        }}
      />

      {/* Concentric sector rings (SMPTE-ish, irregular) */}
      <div className="absolute rounded-full" style={{ inset: 16, border: "1.5px solid rgba(60,40,20,0.55)" }} />
      <div className="absolute rounded-full" style={{ inset: 34, border: "1px dashed rgba(60,40,20,0.35)" }} />
      <div className="absolute rounded-full" style={{ inset: 58, border: "1px solid rgba(60,40,20,0.4)" }} />
      <div className="absolute rounded-full" style={{ inset: 88, border: "1px solid rgba(60,40,20,0.25)" }} />

      {/* Hand-drawn diagonal cross with wobble */}
      <svg className="absolute inset-0" viewBox="0 0 320 320" style={{ opacity: 0.45 }}>
        <path
          d="M 28 30 Q 90 92 160 160 Q 235 230 292 290"
          stroke="#3a281a"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 292 30 Q 230 90 162 160 Q 88 232 28 290"
          stroke="#3a281a"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <line x1="160" y1="14" x2="160" y2="306" stroke="#3a281a" strokeWidth="1.5" opacity="0.55" />
        <line x1="14" y1="160" x2="306" y2="160" stroke="#3a281a" strokeWidth="1.5" opacity="0.55" />
      </svg>

      {/* Typographic ornaments around the edge */}
      <div
        className="absolute"
        style={{
          top: 22,
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: "ui-monospace, monospace",
          fontSize: 9,
          letterSpacing: "0.32em",
          color: "#3a281a",
          opacity: 0.75,
        }}
      >
        PICTURE&nbsp;START
      </div>
      <div
        className="absolute"
        style={{
          bottom: 22,
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: "ui-monospace, monospace",
          fontSize: 8,
          letterSpacing: "0.4em",
          color: "#3a281a",
          opacity: 0.65,
        }}
      >
        REEL&nbsp;1&nbsp;·&nbsp;PART&nbsp;1
      </div>
      <div
        className="absolute"
        style={{
          left: 14,
          top: "50%",
          transform: "translateY(-50%) rotate(-90deg)",
          fontFamily: "ui-monospace, monospace",
          fontSize: 7,
          letterSpacing: "0.4em",
          color: "#3a281a",
          opacity: 0.55,
        }}
      >
        ★ ADTOOL ★
      </div>
      <div
        className="absolute"
        style={{
          right: 14,
          top: "50%",
          transform: "translateY(-50%) rotate(90deg)",
          fontFamily: "ui-monospace, monospace",
          fontSize: 7,
          letterSpacing: "0.4em",
          color: "#3a281a",
          opacity: 0.55,
        }}
      >
        ★ MOTION ★
      </div>

      {/* Stepped sweep hand (hand-crank: ~6 fps) */}
      <div
        key={`sweep-${digit}`}
        className="absolute inset-0 pointer-events-none"
        style={{
          animation: digit > 0 ? "vintageSweep 1s steps(8, end) forwards" : undefined,
        }}
      >
        <div
          className="absolute"
          style={{
            left: "50%",
            top: "50%",
            width: 3,
            height: 132,
            marginLeft: -1.5,
            marginTop: -132,
            transformOrigin: "1.5px 132px",
            background: "linear-gradient(to top, transparent 0%, #3a281a 30%, #1a1410 100%)",
            boxShadow: "0 0 4px rgba(26,20,16,0.6)",
            borderRadius: 1,
          }}
        />
      </div>

      {/* Center hub */}
      <div
        className="absolute rounded-full"
        style={{
          width: 16,
          height: 16,
          background: "#1a1410",
          boxShadow: "0 0 6px rgba(26,20,16,0.8), 0 0 0 2px #d4c19a",
        }}
      />

      {/* The digit — heavy antique serif with chromatic aberration */}
      {digit > 0 && (
        <div
          key={`digit-${digit}`}
          className="absolute"
          style={{
            animation:
              "vintageDigitIn 180ms steps(3) forwards, vintageDigitOut 240ms steps(4) 860ms forwards",
          }}
        >
          {/* red ghost */}
          <span
            className="absolute"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 200,
              lineHeight: 1,
              fontWeight: 900,
              color: "#a83b2a",
              left: -1.5,
              top: 0,
              transform: "translate(-50%, -50%)",
              mixBlendMode: "multiply",
              opacity: 0.55,
            }}
          >
            {digit}
          </span>
          {/* cyan ghost */}
          <span
            className="absolute"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 200,
              lineHeight: 1,
              fontWeight: 900,
              color: "#2a6878",
              left: 1.5,
              top: 0,
              transform: "translate(-50%, -50%)",
              mixBlendMode: "multiply",
              opacity: 0.45,
            }}
          >
            {digit}
          </span>
          {/* main */}
          <span
            className="absolute"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 200,
              lineHeight: 1,
              fontWeight: 900,
              color: "#1a1410",
              left: 0,
              top: 0,
              transform: "translate(-50%, -50%)",
              textShadow: "0 1px 0 rgba(60,40,20,0.5), 0 0 2px rgba(26,20,16,0.8)",
              WebkitTextStroke: "1px #1a1410",
            }}
          >
            {digit}
          </span>
        </div>
      )}

      {/* Cigarette burn (reel-change cue) — top right */}
      {cigBurn && (
        <div
          className="absolute rounded-full"
          style={{
            top: 30,
            right: 36,
            width: 22,
            height: 22,
            background:
              "radial-gradient(circle, #2a1408 0%, #6b3a1a 40%, rgba(168,90,40,0.6) 70%, transparent 100%)",
            boxShadow: "0 0 8px rgba(40,20,10,0.7)",
            animation: "vintageBurn 140ms steps(2) forwards",
          }}
        />
      )}

      {/* Splice line — horizontal scratch sweeping down on digit change */}
      <div
        key={`splice-${splice}`}
        className="absolute inset-0 pointer-events-none overflow-hidden rounded-full"
      >
        <div
          className="absolute left-0 right-0"
          style={{
            height: 2,
            background: "linear-gradient(90deg, transparent, rgba(245,235,210,0.95), rgba(255,250,230,1), rgba(245,235,210,0.95), transparent)",
            boxShadow: "0 0 6px rgba(255,250,230,0.7)",
            top: -4,
            animation: splice > 0 ? "vintageSplice 220ms steps(8) forwards" : undefined,
          }}
        />
      </div>

      {/* Vertical scratches — jump positions */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full">
        {scratches.map((s, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            style={{
              left: `${s.left}%`,
              width: 1,
              background: "rgba(26,20,16,0.55)",
              animation: `vintageScratch ${s.dur}s steps(3) ${s.delay}s infinite`,
              opacity: 0,
            }}
          />
        ))}
      </div>

      {/* Dust specks — flicker on/off */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full">
        {dust.map((d, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: d.size,
              height: d.size,
              background: "#1a1410",
              animation: `vintageDust 0.22s steps(2) ${d.delay}s infinite`,
              opacity: 0,
            }}
          />
        ))}
      </div>

      {/* Heavy film grain */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0 0.05  0 0 0 0.8 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.75'/></svg>\")",
          mixBlendMode: "multiply",
          opacity: 0.5,
          animation: "vintageGrain 0.12s steps(4) infinite",
        }}
      />

      {/* End flash: white frame flicker → black cut */}
      {flash && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background: "#fff8e8",
            animation: "vintageEndFlash 360ms steps(6) forwards",
            zIndex: 90,
          }}
        />
      )}

      <style>{`
        @keyframes vintageDialIn {
          0%   { opacity: 0; transform: scale(0.94); filter: brightness(1.4); }
          50%  { opacity: 1; transform: scale(1.02); filter: brightness(0.7); }
          100% { opacity: 1; transform: scale(1); filter: brightness(1); }
        }
        @keyframes vintageOutro {
          from { opacity: 1; transform: scale(1); filter: brightness(1); }
          to   { opacity: 0; transform: scale(1.06); filter: brightness(1.6) blur(4px); }
        }
        @keyframes vintageJitter {
          0%   { translate: 0 0; }
          25%  { translate: -1px 1px; }
          50%  { translate: 1px -1px; }
          75%  { translate: -1px -1px; }
          100% { translate: 1px 1px; }
        }
        @keyframes vintageFlicker {
          0%   { filter: brightness(1) sepia(0.15); }
          33%  { filter: brightness(0.88) sepia(0.25); }
          66%  { filter: brightness(1.12) sepia(0.1); }
          100% { filter: brightness(0.96) sepia(0.2); }
        }
        @keyframes vintageSweep {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes vintageDigitIn {
          0%   { opacity: 0; transform: scale(0.6); }
          50%  { opacity: 0.85; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes vintageDigitOut {
          0%   { opacity: 1; transform: scale(1); }
          40%  { opacity: 0.7; transform: scale(1.3); }
          100% { opacity: 0; transform: scale(1.8); filter: blur(2px); }
        }
        @keyframes vintageBurn {
          0%   { opacity: 0; transform: scale(0.7); }
          50%  { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0; transform: scale(0.9); }
        }
        @keyframes vintageSplice {
          0%   { transform: translateY(0); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(330px); opacity: 0; }
        }
        @keyframes vintageScratch {
          0%   { opacity: 0; transform: translateX(0); }
          33%  { opacity: 0.7; transform: translateX(-2px); }
          66%  { opacity: 0; transform: translateX(8px); }
          100% { opacity: 0.5; transform: translateX(-4px); }
        }
        @keyframes vintageDust {
          0%   { opacity: 0; }
          50%  { opacity: 0.8; }
          100% { opacity: 0; }
        }
        @keyframes vintageGrain {
          0%   { transform: translate(0, 0); }
          25%  { transform: translate(-6px, 4px); }
          50%  { transform: translate(5px, -3px); }
          75%  { transform: translate(-3px, -5px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes vintageEndFlash {
          0%   { opacity: 0; background: #fff8e8; }
          16%  { opacity: 1; background: #fff8e8; }
          33%  { opacity: 0; background: #fff8e8; }
          50%  { opacity: 1; background: #fff8e8; }
          66%  { opacity: 0; background: #0a0805; }
          100% { opacity: 1; background: #0a0805; }
        }
      `}</style>
    </div>
  );
}
