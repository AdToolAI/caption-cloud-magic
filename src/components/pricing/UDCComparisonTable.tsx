import { motion } from "framer-motion";
import { Check, X, Minus } from "lucide-react";

/**
 * UDC vs generic AI editors — feature comparison table.
 * Placed directly under UDCPricingHighlight to reinforce the moat right
 * before the checkout decision.
 */
type Cell = "yes" | "no" | "partial";

interface Row {
  feature: string;
  detail: string;
  udc: Cell;
  capcut: Cell;
  descript: Cell;
}

const ROWS: Row[] = [
  {
    feature: "Voice-Lock per project",
    detail: "Same ElevenLabs voice, tone & language across every render.",
    udc: "yes",
    capcut: "no",
    descript: "no",
  },
  {
    feature: "Character-Anchor Refresh",
    detail: "Detects identity drift frame-by-frame and snaps back to anchor.",
    udc: "yes",
    capcut: "no",
    descript: "no",
  },
  {
    feature: "CI-Preflight (14 checks)",
    detail: "Aspect, loudness, endcard, subtitles, brand — checked pre-render.",
    udc: "yes",
    capcut: "no",
    descript: "partial",
  },
  {
    feature: "Auto Cut-Down (15s / 6s)",
    detail: "Preserves hook + payoff automatically — no manual re-cut.",
    udc: "yes",
    capcut: "partial",
    descript: "no",
  },
  {
    feature: "Master-Snapshot Restore",
    detail: "Every destructive edit auto-backs-up the master timeline.",
    udc: "yes",
    capcut: "no",
    descript: "no",
  },
];

const cellIcon = (v: Cell) => {
  if (v === "yes") return <Check className="w-4 h-4 text-emerald-400" />;
  if (v === "no") return <X className="w-4 h-4 text-muted-foreground/60" />;
  return <Minus className="w-4 h-4 text-amber-400" />;
};

const cellLabel = (v: Cell) => {
  if (v === "yes") return "Included";
  if (v === "no") return "Not available";
  return "Partial";
};

export const UDCComparisonTable = () => (
  <motion.section
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-80px" }}
    transition={{ duration: 0.5 }}
    className="max-w-5xl mx-auto px-4 py-12"
    aria-labelledby="udc-comparison-title"
  >
    <div className="text-center mb-8">
      <h2
        id="udc-comparison-title"
        className="text-2xl md:text-3xl font-semibold tracking-tight"
      >
        Why generic editors can't match this
      </h2>
      <p className="text-muted-foreground mt-2 max-w-2xl mx-auto text-sm">
        Consistency-First features that keep your brand, voice, and character
        identical across every ad, cutdown and platform.
      </p>
    </div>

    <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur overflow-hidden">
      <div className="grid grid-cols-[1.4fr_repeat(3,minmax(0,1fr))] text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-card/60 border-b border-border/60">
        <div className="px-4 py-3">Feature</div>
        <div className="px-4 py-3 text-center text-primary">UDC (Pro)</div>
        <div className="px-4 py-3 text-center">CapCut</div>
        <div className="px-4 py-3 text-center">Descript</div>
      </div>

      {ROWS.map((row, i) => (
        <div
          key={row.feature}
          className={`grid grid-cols-[1.4fr_repeat(3,minmax(0,1fr))] items-center ${
            i % 2 === 0 ? "bg-transparent" : "bg-card/30"
          } border-b border-border/40 last:border-b-0`}
        >
          <div className="px-4 py-4">
            <div className="text-sm font-medium">{row.feature}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {row.detail}
            </div>
          </div>
          {(["udc", "capcut", "descript"] as const).map((col) => (
            <div
              key={col}
              className="px-4 py-4 flex flex-col items-center justify-center gap-1"
              aria-label={`${row.feature}: ${cellLabel(row[col])}`}
            >
              {cellIcon(row[col])}
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {cellLabel(row[col])}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>

    <p className="text-xs text-muted-foreground text-center mt-4">
      Comparison based on publicly documented features as of 2026. Competitor
      product names are trademarks of their respective owners.
    </p>
  </motion.section>
);
