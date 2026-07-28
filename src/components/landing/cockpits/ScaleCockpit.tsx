import { motion, useReducedMotion } from "framer-motion";

// Purely decorative: 4 radial progress rings for channels, plus a scrolling ticker.
const CHANNELS = [
  { key: "TT", label: "TikTok", pct: 0.82 },
  { key: "IG", label: "Meta", pct: 0.68 },
  { key: "YT", label: "YouTube", pct: 0.74 },
  { key: "X", label: "X", pct: 0.55 },
];

const Ring = ({ pct, delay, label, code }: { pct: number; delay: number; label: string; code: string }) => {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
        <circle cx="24" cy="24" r={r} stroke="hsl(var(--border))" strokeWidth="3" fill="none" opacity="0.4" />
        <motion.circle
          cx="24"
          cy="24"
          r={r}
          stroke="hsl(var(--primary))"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1.6, delay, ease: "easeOut" }}
          transform="rotate(-90 24 24)"
          style={{ filter: "drop-shadow(0 0 4px hsl(var(--primary) / 0.5))" }}
        />
        <text
          x="24"
          y="27"
          textAnchor="middle"
          className="fill-foreground font-display"
          fontSize="11"
          fontWeight="600"
        >
          {code}
        </text>
      </svg>
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70">{label}</span>
    </div>
  );
};

export const ScaleCockpit = () => {
  const reduce = useReducedMotion();

  return (
    <div
      role="img"
      aria-label="Multi-Channel Skalierungs-Vorschau"
      className="relative h-[170px] w-full rounded-xl border border-border/40 bg-gradient-to-br from-background/40 to-card/20 p-3 overflow-hidden"
    >
      {/* ticker */}
      <div className="h-4 mb-2 overflow-hidden relative">
        <motion.div
          animate={reduce ? undefined : { y: [0, -16, -32, -48, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", times: [0, 0.25, 0.5, 0.75, 1] }}
          className="flex flex-col text-[10px] uppercase tracking-widest text-primary/80 font-mono"
        >
          <span>▲ auto-publish · tiktok</span>
          <span>▲ auto-publish · meta</span>
          <span>▲ auto-publish · youtube</span>
          <span>▲ auto-publish · x</span>
          <span>▲ auto-publish · tiktok</span>
        </motion.div>
      </div>

      <div className="grid grid-cols-4 gap-2 pt-2">
        {CHANNELS.map((ch, i) => (
          <Ring key={ch.key} pct={ch.pct} delay={0.3 + i * 0.15} label={ch.label} code={ch.key} />
        ))}
      </div>
    </div>
  );
};
