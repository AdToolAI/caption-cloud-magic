import { motion } from "framer-motion";
import { Zap, Route, Shield, Coins, Timer, Layers, Users, Lock, Calendar, Percent, TrendingDown, Sparkles } from "lucide-react";

const Frame = ({ children, label }: { children: React.ReactNode; label?: string }) => (
  <div className="relative w-full h-full rounded-xl border border-primary/25 bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-md overflow-hidden">
    {label && (
      <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.25em] text-primary/70">
        <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
        {label}
      </div>
    )}
    <div className="w-full h-full flex items-center justify-center p-6">{children}</div>
  </div>
);

/* ─── MULTI-PROVIDER ─── */

export const ProviderConstellationVisual = () => {
  const providers = ["Kling", "Hailuo", "Sora", "Veo", "Runway", "Luma", "Flux", "SD"];
  return (
    <Frame label="Multi-Provider · Constellation">
      <div className="relative w-64 h-64">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full border border-primary bg-primary/20 flex items-center justify-center">
            <Zap className="h-7 w-7 text-primary" />
          </div>
        </div>
        {providers.map((p, i) => {
          const angle = (i / providers.length) * Math.PI * 2;
          const x = 50 + Math.cos(angle) * 42;
          const y = 50 + Math.sin(angle) * 42;
          return (
            <motion.div
              key={p}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.08 }}
              style={{ left: `${x}%`, top: `${y}%` }}
              className="absolute -ml-8 -mt-4 w-16 h-8 rounded-full border border-primary/40 bg-background/80 flex items-center justify-center text-[9px] uppercase tracking-widest text-primary/80"
            >
              {p}
            </motion.div>
          );
        })}
      </div>
    </Frame>
  );
};

export const RouteBestPickVisual = () => (
  <Frame label="Multi-Provider · Routing">
    <div className="w-full max-w-md space-y-2">
      {[
        { l: "Kling Omni", s: 92, pick: true },
        { l: "Hailuo 02", s: 78 },
        { l: "Sora 2", s: 71 },
        { l: "Veo 3.1", s: 65 },
      ].map((r, i) => (
        <motion.div
          key={r.l}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.12 }}
          className={`flex items-center gap-3 h-9 rounded border px-3 ${r.pick ? "border-primary/70 bg-primary/10" : "border-primary/20 bg-primary/5"}`}
        >
          <Route className={`h-3.5 w-3.5 ${r.pick ? "text-primary" : "text-primary/50"}`} />
          <div className="text-[11px] uppercase tracking-widest text-foreground/90 w-28">{r.l}</div>
          <div className="flex-1 h-1 bg-primary/10 rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${r.s}%` }} transition={{ duration: 0.8, delay: 0.2 + i * 0.12 }} className="h-full bg-gradient-to-r from-primary to-gold-dark" />
          </div>
          <div className="text-[10px] tabular-nums text-primary/80 w-8 text-right">{r.s}</div>
          {r.pick && <div className="text-[9px] uppercase tracking-widest text-primary">PICK</div>}
        </motion.div>
      ))}
    </div>
  </Frame>
);

export const FallbackChainVisual = () => (
  <Frame label="Multi-Provider · Fallback">
    <div className="flex items-center gap-3">
      {["PRIMARY", "FALLBACK", "SAFETY"].map((l, i) => (
        <motion.div
          key={l}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.25 }}
          className="flex items-center gap-3"
        >
          <div className={`px-3 py-2 rounded border ${i === 0 ? "border-primary bg-primary/15" : "border-primary/30 bg-primary/5"} text-[10px] uppercase tracking-widest text-primary`}>{l}</div>
          {i < 2 && (
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.25 + i * 0.25 }}
              className="w-8 h-px bg-gradient-to-r from-primary to-primary/30 origin-left"
            />
          )}
        </motion.div>
      ))}
    </div>
  </Frame>
);

export const CostGuardMeterVisual = () => (
  <Frame label="Multi-Provider · Cost Guard">
    <div className="w-full max-w-sm space-y-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-primary/70">
        <Coins className="h-3 w-3" /> BUDGET REMAINING · 68%
      </div>
      <div className="relative h-4 rounded-full bg-primary/10 overflow-hidden border border-primary/20">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "68%" }}
          transition={{ duration: 1.2 }}
          className="h-full bg-gradient-to-r from-primary to-gold-dark"
        />
      </div>
      <div className="grid grid-cols-3 gap-2 text-[9px] uppercase tracking-widest text-primary/60">
        <div>MIN COST</div><div className="text-center">TARGET</div><div className="text-right">CAP</div>
      </div>
    </div>
  </Frame>
);

export const LatencyDuelVisual = () => (
  <Frame label="Multi-Provider · Latency Duel">
    <div className="w-full max-w-md space-y-3">
      {[
        { l: "Route A", t: 1.2 },
        { l: "Route B", t: 2.8 },
        { l: "Route C", t: 4.6 },
      ].map((r, i) => (
        <div key={r.l} className="flex items-center gap-3">
          <Timer className="h-3.5 w-3.5 text-primary/70" />
          <div className="text-[10px] uppercase tracking-widest text-primary/80 w-20">{r.l}</div>
          <div className="flex-1 h-2 bg-primary/10 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(r.t / 5) * 100}%` }}
              transition={{ duration: 1, delay: i * 0.15 }}
              className={`h-full ${i === 0 ? "bg-gradient-to-r from-primary to-gold-dark" : "bg-primary/30"}`}
            />
          </div>
          <div className="text-[10px] tabular-nums text-primary/80 w-12 text-right">{r.t}s</div>
        </div>
      ))}
    </div>
  </Frame>
);

export const UnifiedOutputVisual = () => (
  <Frame label="Multi-Provider · Unified Output">
    <div className="flex items-center gap-6">
      <div className="grid grid-cols-2 gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-8 h-8 rounded border border-primary/30 bg-primary/5" />
        ))}
      </div>
      <motion.div
        animate={{ x: [0, 6, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <Layers className="h-6 w-6 text-primary" />
      </motion.div>
      <div className="w-24 h-24 rounded-lg border border-primary bg-gradient-to-br from-primary/25 to-gold-dark/15 flex items-center justify-center">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>
    </div>
  </Frame>
);

/* ─── PRICE GUARANTEE ─── */

export const FoundersSeatCounterVisual = () => (
  <Frame label="Founders · Seats">
    <div className="flex flex-col items-center gap-3">
      <Users className="h-10 w-10 text-primary" />
      <div className="flex items-baseline gap-2">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-5xl text-primary"
        >
          847
        </motion.div>
        <div className="text-lg text-muted-foreground">/ 1000</div>
      </div>
      <div className="text-[10px] uppercase tracking-widest text-primary/70">FOUNDER SEATS TAKEN</div>
      <div className="w-56 h-1.5 bg-primary/10 rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: "84.7%" }} transition={{ duration: 1.4 }} className="h-full bg-gradient-to-r from-primary to-gold-dark" />
      </div>
    </div>
  </Frame>
);

export const PriceLock24mVisual = () => (
  <Frame label="Credits · 24m Founder Bonus">
    <div className="flex items-center gap-6">
      <div className="flex flex-col items-center">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground line-through">100 €</div>
        <div className="font-display text-4xl text-primary">80 €</div>
        <div className="text-[10px] uppercase tracking-widest text-primary/70">KI-CREDITS</div>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Lock className="h-8 w-8 text-primary" />
        <div className="px-3 py-1 rounded-full border border-primary/50 bg-primary/10 text-[10px] uppercase tracking-widest text-primary">24 MONTHS</div>
      </div>
    </div>
  </Frame>
);

export const DiscountShieldVisual = () => (
  <Frame label="Founders · 20 % Shield">
    <div className="relative w-40 h-40 flex items-center justify-center">
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2.5, repeat: Infinity }}
        className="absolute inset-0 rounded-full border-2 border-primary/40 bg-gradient-to-br from-primary/15 to-transparent"
      />
      <Shield className="absolute inset-0 m-auto h-32 w-32 text-primary/80" strokeWidth={1} />
      <div className="relative flex flex-col items-center">
        <Percent className="h-6 w-6 text-primary" />
        <div className="font-display text-3xl text-primary">20</div>
      </div>
    </div>
  </Frame>
);

export const TimelineGuaranteeVisual = () => (
  <Frame label="Guarantee · Timeline">
    <div className="w-full max-w-md">
      <div className="relative h-1 bg-primary/15 rounded-full">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: 2 }}
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-gold-dark rounded-full"
        />
        {[0, 6, 12, 18, 24].map((m, i) => (
          <div
            key={m}
            style={{ left: `${(m / 24) * 100}%` }}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
            <div className="text-[9px] uppercase tracking-widest text-primary/70 mt-2">M{m}</div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest text-primary/80">
        <Calendar className="h-3 w-3" /> 20 % ON AI CREDITS · GUARANTEED
      </div>
    </div>
  </Frame>
);

export const SeatMap1000Visual = () => (
  <Frame label="Founders · Seat Map">
    <div className="grid grid-cols-20 gap-[3px] w-full max-w-lg" style={{ gridTemplateColumns: "repeat(25, minmax(0, 1fr))" }}>
      {Array.from({ length: 200 }).map((_, i) => {
        const taken = i < 170;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.004 }}
            className={`aspect-square rounded-[1px] ${taken ? "bg-primary/70" : "bg-primary/10 border border-primary/20"}`}
          />
        );
      })}
    </div>
  </Frame>
);

export const SavingsCurveVisual = () => (
  <Frame label="Founders · Savings">
    <div className="w-full max-w-md flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-primary/70">
        <TrendingDown className="h-3 w-3" /> LIFETIME SAVINGS
      </div>
      <svg viewBox="0 0 300 120" className="w-full">
        <motion.path
          d="M0,20 C60,25 120,35 180,55 C220,70 260,90 300,110"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2 }}
        />
        <motion.circle cx="300" cy="110" r="4" fill="hsl(var(--primary))" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }} />
      </svg>
      <div className="font-display text-3xl text-primary">− 90,96 €</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">ÜBER 24 MONATE</div>
    </div>
  </Frame>
);
