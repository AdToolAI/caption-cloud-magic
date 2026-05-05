import { useEffect, useState } from "react";
import { Bell, Sparkles } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

export const FloatingAppHeader = () => {
  const { t } = useTranslation();
  const [credits, setCredits] = useState(2400);

  // Animate credits ticking up to 2,847
  useEffect(() => {
    const target = 2847;
    const duration = 1800;
    const start = performance.now();
    const from = 2400;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCredits(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="relative w-full max-w-[520px] mx-auto"
      style={{ transform: "translateZ(40px)" }}
    >
      <div
        className="flex items-center gap-3 px-4 py-2.5 bg-black/80 backdrop-blur-xl"
        style={{
          borderRadius: "4px",
          boxShadow: `
            0 0 0 1px hsla(43, 90%, 68%, 0.6),
            inset 0 0 0 1px rgba(0, 0, 0, 0.85),
            0 12px 30px -8px rgba(0, 0, 0, 0.9),
            0 0 24px -8px hsla(43, 90%, 68%, 0.3)
          `,
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div className="relative w-6 h-6 flex items-center justify-center bg-gradient-to-br from-primary to-gold-dark">
            <Sparkles className="h-3.5 w-3.5 text-black" strokeWidth={2.5} />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">
            AdTool
          </span>
        </div>

        <div className="w-px h-4 bg-primary/45" />

        {/* Plan badge */}
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary border border-primary/70 px-1.5 py-0.5">
          {t("landing.hero.deck.headerPlan")}
        </span>

        {/* Credits ticker */}
        <div className="flex items-baseline gap-1 ml-1">
          <span className="text-[12px] font-mono font-bold tabular-nums text-foreground">
            {credits.toLocaleString("de-DE")}
          </span>
          <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("landing.hero.deck.headerCredits")}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Bell with red dot */}
          <div className="relative">
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
            <div
              className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full animate-pulse"
              style={{
                background: "hsl(355, 75%, 48%)",
                boxShadow: "0 0 6px hsl(355, 75%, 48%)",
              }}
            />
          </div>

          {/* Avatar */}
          <div
            className="w-6 h-6 flex items-center justify-center text-[10px] font-bold text-black bg-gradient-to-br from-primary to-gold-dark"
            style={{ borderRadius: "2px" }}
          >
            A
          </div>
        </div>
      </div>

      {/* Hairline shadow line below */}
      <div className="absolute inset-x-8 -bottom-1 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
    </div>
  );
};
