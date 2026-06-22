import type { ReactNode } from "react";

interface StagePanelProps {
  /** Two-digit slate index, e.g. "01". */
  slateIndex?: string;
  /** Mono-caps eyebrow shown above the title, e.g. "SCENE · BRIEFING". */
  eyebrow?: string;
  /** Section title rendered in Playfair Display. */
  title?: ReactNode;
  /** Optional accessory rendered on the right side of the header. */
  accessory?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Visual variant — "default" gold glass, "destructive" red-tinted. */
  tone?: "default" | "destructive";
}

/**
 * StagePanel — the unified "Sound Stage" container for Motion Studio sections.
 *
 * Visual goals (Bond-meets-Apple sound stage):
 *  - Real lit-glass surface, not a dark grey card. Layered vertical gradient,
 *    2xl blur, saturation lift, gold outer halo + inner top filament.
 *  - "Take-Slate" header with a hazard-stripe edge and a pulsing gold REC dot
 *    so it actually reads as a clapperboard, not just a number badge.
 *  - Hover lifts the gold glow without changing layout.
 */
export default function StagePanel({
  slateIndex,
  eyebrow,
  title,
  accessory,
  children,
  className = "",
  tone = "default",
}: StagePanelProps) {
  const isDestructive = tone === "destructive";

  // Gold accent set (default) vs destructive red
  const ringHsl = isDestructive ? "0,84%,60%" : "43,90%,68%";

  return (
    <section
      className={`stage-panel group/stage-panel relative overflow-hidden rounded-2xl ${className}`}
      style={{
        background:
          "linear-gradient(180deg, hsla(225,32%,12%,0.72) 0%, hsla(228,38%,6%,0.62) 100%)",
        backdropFilter: "blur(22px) saturate(140%)",
        WebkitBackdropFilter: "blur(22px) saturate(140%)",
        boxShadow: `
          inset 0 1px 0 hsla(${isDestructive ? "0,84%,75%" : "43,90%,82%"}, 0.22),
          inset 0 0 0 1px hsla(${ringHsl}, 0.14),
          0 0 0 1px hsla(${ringHsl}, 0.22),
          0 24px 60px -28px hsla(${ringHsl}, 0.30),
          0 10px 28px -14px hsla(0,0%,0%,0.65)
        `,
        transition: "box-shadow 220ms ease, transform 220ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `
          inset 0 1px 0 hsla(${isDestructive ? "0,84%,75%" : "43,90%,82%"}, 0.28),
          inset 0 0 0 1px hsla(${ringHsl}, 0.22),
          0 0 0 1px hsla(${ringHsl}, 0.42),
          0 28px 70px -22px hsla(${ringHsl}, 0.45),
          0 12px 32px -14px hsla(0,0%,0%,0.7)
        `;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `
          inset 0 1px 0 hsla(${isDestructive ? "0,84%,75%" : "43,90%,82%"}, 0.22),
          inset 0 0 0 1px hsla(${ringHsl}, 0.14),
          0 0 0 1px hsla(${ringHsl}, 0.22),
          0 24px 60px -28px hsla(${ringHsl}, 0.30),
          0 10px 28px -14px hsla(0,0%,0%,0.65)
        `;
      }}
    >
      {/* Top inner highlight (gold filament) — runs the full panel width */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, hsla(${ringHsl},0.7), transparent)`,
        }}
      />

      {/* Soft radial spotlight from the top-left */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 60% 40% at 10% 0%, hsla(${ringHsl},0.10), transparent 60%)`,
        }}
      />

      {(title || slateIndex || eyebrow) && (
        <header className="relative flex items-stretch gap-0 pr-5">
          {/* Hazard-stripe slate edge */}
          {slateIndex && (
            <div
              aria-hidden
              className="shrink-0 self-stretch w-2.5"
              style={{
                background: isDestructive
                  ? "repeating-linear-gradient(135deg, #1a0606 0 6px, hsl(0,84%,55%) 6px 12px)"
                  : "repeating-linear-gradient(135deg, #0b0b0b 0 6px, hsl(43,90%,58%) 6px 12px)",
                boxShadow: "inset -1px 0 0 rgba(0,0,0,0.5)",
              }}
            />
          )}

          <div className="flex flex-1 items-center justify-between gap-4 pl-4 pt-4 pb-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              {slateIndex && (
                <div
                  className="shrink-0 flex h-10 items-center gap-2 rounded-md border bg-black/70 px-2.5 py-1.5"
                  style={{
                    borderColor: `hsla(${ringHsl},0.45)`,
                    boxShadow: `inset 0 0 0 1px hsla(0,0%,100%,0.04), 0 0 14px -4px hsla(${ringHsl},0.45)`,
                  }}
                  aria-hidden
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{
                      background: `hsl(${ringHsl})`,
                      boxShadow: `0 0 8px hsla(${ringHsl},0.9)`,
                      animation: "stageRecPulse 1.6s ease-in-out infinite",
                    }}
                  />
                  <span
                    className="font-mono text-[10px] tracking-[0.25em]"
                    style={{ color: `hsl(${ringHsl})` }}
                  >
                    SC {slateIndex}
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.25em] text-white/40">
                    TAKE 1
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                {eyebrow && (
                  <p
                    className="font-mono text-[9px] uppercase tracking-[0.35em] mb-1"
                    style={{ color: `hsla(${ringHsl}, 0.78)` }}
                  >
                    {eyebrow}
                  </p>
                )}
                {title && (
                  <h2
                    className="text-[17px] leading-tight font-semibold text-foreground"
                    style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                  >
                    {title}
                  </h2>
                )}
              </div>
            </div>
            {accessory && <div className="shrink-0">{accessory}</div>}
          </div>
        </header>
      )}

      {/* Gold hairline rule under header */}
      {(title || slateIndex || eyebrow) && (
        <div
          aria-hidden
          className="mx-5 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, hsla(${ringHsl},0.35), transparent)`,
          }}
        />
      )}

      <div className="relative px-5 py-5">{children}</div>
    </section>
  );
}
