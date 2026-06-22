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
 * - Deep glass surface (`#0b1120/55` + backdrop-blur)
 * - Gold hairline border + inner top highlight + deep drop shadow
 * - Optional Take-Slate header (number badge + Playfair title + gold rule)
 *
 * Drop-in replacement for shadcn `<Card>` blocks inside the Briefing flow.
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

  const borderColor = isDestructive
    ? "border-destructive/30"
    : "border-amber-200/15";
  const slateBorder = isDestructive
    ? "border-destructive/60"
    : "border-amber-200/40";
  const slateText = isDestructive
    ? "text-destructive"
    : "text-amber-200/90";
  const eyebrowColor = isDestructive
    ? "text-destructive/80"
    : "text-amber-200/70";
  const ruleGradient = isDestructive
    ? "linear-gradient(90deg, hsla(0,84%,60%,0.55), transparent)"
    : "linear-gradient(90deg, hsla(43,90%,68%,0.55), transparent)";

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border ${borderColor} bg-[hsl(230_30%_5%/0.55)] backdrop-blur-xl shadow-[inset_0_1px_0_hsla(43,90%,68%,0.10),0_30px_80px_-30px_hsla(43,90%,68%,0.18)] ${className}`}
    >
      {/* Top inner highlight (gold filament) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px"
        style={{ background: ruleGradient }}
      />

      {(title || slateIndex || eyebrow) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
          <div className="flex items-start gap-3 min-w-0">
            {slateIndex && (
              <div
                className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-md border ${slateBorder} bg-[hsl(230_30%_3%)] font-mono text-[11px] tracking-widest ${slateText} shadow-[inset_0_0_0_1px_hsla(0,0%,100%,0.04)]`}
                aria-hidden
              >
                {slateIndex}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {eyebrow && (
                <p
                  className={`font-mono text-[9px] uppercase tracking-[0.35em] ${eyebrowColor} mb-1`}
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
        </header>
      )}

      {/* Gold hairline rule under header */}
      {(title || slateIndex || eyebrow) && (
        <div
          aria-hidden
          className="mx-5 h-px"
          style={{
            background: isDestructive
              ? "linear-gradient(90deg, transparent, hsla(0,84%,60%,0.25), transparent)"
              : "linear-gradient(90deg, transparent, hsla(43,90%,68%,0.25), transparent)",
          }}
        />
      )}

      <div className="px-5 py-5">{children}</div>
    </section>
  );
}
