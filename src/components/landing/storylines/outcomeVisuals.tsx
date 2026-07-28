import { motion } from "framer-motion";
import {
  CalendarDays,
  Target,
  Layers,
  Repeat,
  Lock,
  Activity,
  TrendingUp,
  Clock,
  Split,
  Sparkles,
  Radio,
  Rocket,
  Copy,
  ListChecks,
  Globe2,
} from "lucide-react";

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

/* ─── PLAN ─── */

export const HeatmapBuildVisual = () => {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const slots = Array.from({ length: 4 });
  return (
    <Frame label="Plan · Heatmap Build">
      <div className="w-full max-w-lg">
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => (
            <div key={d} className="text-center text-[9px] uppercase tracking-widest text-primary/60">{d}</div>
          ))}
          {slots.map((_, r) =>
            days.map((_, c) => {
              const i = r * 7 + c;
              const intensity = ((i * 37) % 100) / 100;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 0.4 + intensity * 0.6, scale: 1 }}
                  transition={{ delay: i * 0.03, duration: 0.4 }}
                  className="aspect-square rounded"
                  style={{
                    background: `linear-gradient(135deg, hsl(var(--primary) / ${0.15 + intensity * 0.55}), hsl(45 60% 30% / ${intensity * 0.5}))`,
                    border: "1px solid hsl(var(--primary) / 0.25)",
                  }}
                />
              );
            }),
          )}
        </div>
      </div>
    </Frame>
  );
};

export const SlotAutoPickVisual = () => (
  <Frame label="Plan · Slot Auto-Pick">
    <div className="w-full max-w-md space-y-3">
      {[
        { t: "MON · 08:15", w: "22%", pick: false },
        { t: "TUE · 19:40", w: "84%", pick: true },
        { t: "WED · 12:00", w: "56%", pick: false },
        { t: "THU · 21:10", w: "71%", pick: false },
      ].map((row, i) => (
        <motion.div
          key={row.t}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.15 }}
          className={`relative h-8 rounded border ${row.pick ? "border-primary/70 bg-primary/10" : "border-primary/20 bg-primary/5"} flex items-center px-3`}
        >
          <div className="text-[10px] uppercase tracking-widest text-primary/80 w-24">{row.t}</div>
          <div className="flex-1 h-1 bg-primary/10 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: row.w }}
              transition={{ delay: 0.2 + i * 0.15, duration: 0.6 }}
              className="h-full bg-gradient-to-r from-primary to-gold-dark"
            />
          </div>
          {row.pick && (
            <div className="ml-3 text-[9px] uppercase tracking-widest text-primary flex items-center gap-1">
              <Target className="h-3 w-3" /> PICK
            </div>
          )}
        </motion.div>
      ))}
    </div>
  </Frame>
);

export const ChannelMatrixVisual = () => {
  const channels = ["TT", "IG", "YT", "X"];
  const formats = ["9:16", "1:1", "16:9", "Story"];
  return (
    <Frame label="Plan · Channel × Format">
      <div className="w-full max-w-md">
        <div className="grid grid-cols-5 gap-2 text-[9px] uppercase tracking-widest text-primary/70">
          <div />
          {channels.map((c) => <div key={c} className="text-center">{c}</div>)}
          {formats.map((f, r) => (
            <>
              <div key={f} className="flex items-center">{f}</div>
              {channels.map((c, cc) => {
                const on = (r + cc) % 3 !== 0;
                return (
                  <motion.div
                    key={`${f}-${c}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: (r * 4 + cc) * 0.06 }}
                    className={`aspect-square rounded ${on ? "bg-gradient-to-br from-primary/60 to-gold-dark/40 border-primary/60" : "bg-primary/5 border-primary/15"} border`}
                  />
                );
              })}
            </>
          ))}
        </div>
      </div>
    </Frame>
  );
};

export const RecurrenceLoopVisual = () => (
  <Frame label="Plan · Recurrence">
    <div className="relative w-56 h-56">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 rounded-full border border-dashed border-primary/40"
      />
      {["MON", "WED", "FRI", "SUN"].map((d, i) => {
        const angle = (i / 4) * Math.PI * 2;
        const x = 50 + Math.cos(angle) * 40;
        const y = 50 + Math.sin(angle) * 40;
        return (
          <div
            key={d}
            className="absolute w-12 h-12 -ml-6 -mt-6 rounded-full border border-primary/50 bg-background/80 flex items-center justify-center text-[9px] uppercase tracking-widest text-primary"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {d}
          </div>
        );
      })}
      <div className="absolute inset-0 flex items-center justify-center">
        <Repeat className="h-8 w-8 text-primary" />
      </div>
    </div>
  </Frame>
);

export const MonthLockedVisual = () => (
  <Frame label="Plan · Month Locked">
    <div className="flex flex-col items-center gap-4">
      <CalendarDays className="h-16 w-16 text-primary" />
      <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-primary/50 bg-primary/10">
        <Lock className="h-4 w-4 text-primary" />
        <span className="text-xs uppercase tracking-widest text-primary">28 Slots · Locked</span>
      </div>
    </div>
  </Frame>
);

/* ─── OPTIMIZE ─── */

export const SignalStreamVisual = () => (
  <Frame label="Optimize · Live Signal">
    <div className="w-full max-w-lg space-y-2">
      {[Activity, TrendingUp, Radio].map((Icon, i) => (
        <div key={i} className="relative h-10 rounded border border-primary/20 bg-primary/5 overflow-hidden flex items-center gap-3 px-3">
          <Icon className="h-4 w-4 text-primary shrink-0" />
          <svg viewBox="0 0 200 30" className="flex-1 h-full">
            <motion.path
              d={`M0,15 ${Array.from({ length: 20 })
                .map((_, k) => `L${k * 10},${15 + Math.sin(k + i) * 8}`)
                .join(" ")}`}
              stroke="hsl(var(--primary))"
              strokeWidth="1.5"
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, delay: i * 0.3, repeat: Infinity, repeatType: "reverse" }}
            />
          </svg>
        </div>
      ))}
    </div>
  </Frame>
);

export const CtrDeltaBarVisual = () => (
  <Frame label="Optimize · CTR Δ">
    <div className="w-full max-w-md space-y-3">
      {[
        { l: "Variant A", w: "42%" },
        { l: "Variant B", w: "68%" },
        { l: "Variant C", w: "91%" },
      ].map((r, i) => (
        <div key={r.l}>
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-primary/70 mb-1">
            <span>{r.l}</span>
            <span className="text-primary">+{i * 12 + 4}%</span>
          </div>
          <div className="h-2 rounded-full bg-primary/10 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: r.w }}
              transition={{ duration: 1, delay: i * 0.2 }}
              className="h-full bg-gradient-to-r from-primary to-gold-dark"
            />
          </div>
        </div>
      ))}
    </div>
  </Frame>
);

export const WatchtimeCurveVisual = () => (
  <Frame label="Optimize · Watch-Time">
    <svg viewBox="0 0 300 140" className="w-full max-w-lg">
      <defs>
        <linearGradient id="wt" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d="M0,120 C40,90 80,110 120,70 C160,30 200,60 240,40 C270,25 290,20 300,15 L300,140 L0,140 Z"
        fill="url(#wt)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      />
      <motion.path
        d="M0,120 C40,90 80,110 120,70 C160,30 200,60 240,40 C270,25 290,20 300,15"
        stroke="hsl(var(--primary))"
        strokeWidth="2"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 2 }}
      />
      <text x="8" y="20" fill="hsl(var(--primary) / 0.6)" fontSize="9" fontFamily="monospace">WATCH-TIME +38%</text>
    </svg>
  </Frame>
);

export const ABDuelVisual = () => (
  <Frame label="Optimize · A/B Duel">
    <div className="flex items-stretch gap-4 w-full max-w-md">
      {["A", "B"].map((l, i) => (
        <motion.div
          key={l}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.2 }}
          className={`flex-1 aspect-video rounded-lg border ${i === 1 ? "border-primary" : "border-primary/30"} bg-gradient-to-br from-primary/10 to-background flex flex-col items-center justify-center gap-2`}
        >
          <Split className="h-6 w-6 text-primary" />
          <span className="text-2xl font-display text-primary">{l}</span>
          {i === 1 && (
            <span className="text-[9px] uppercase tracking-widest text-primary">WINNER</span>
          )}
        </motion.div>
      ))}
    </div>
  </Frame>
);

export const InsightCardsVisual = () => (
  <Frame label="Optimize · Insights">
    <div className="grid grid-cols-2 gap-3 w-full max-w-md">
      {[
        { t: "Hook @0.8s", v: "+21% Retention" },
        { t: "CTA @6.2s", v: "+14% CTR" },
        { t: "Cut @12s", v: "-9% Drop-off" },
        { t: "Format 9:16", v: "+38% Reach" },
      ].map((c, i) => (
        <motion.div
          key={c.t}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.12 }}
          className="rounded border border-primary/25 bg-primary/5 p-3"
        >
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-primary/70 mb-1">
            <Sparkles className="h-3 w-3" />
            {c.t}
          </div>
          <div className="text-sm text-foreground">{c.v}</div>
        </motion.div>
      ))}
    </div>
  </Frame>
);

/* ─── SCALE ─── */

export const ChannelRingsFillVisual = () => {
  const rings = [
    { l: "TT", pct: 82 },
    { l: "IG", pct: 64 },
    { l: "YT", pct: 91 },
    { l: "X", pct: 45 },
  ];
  return (
    <Frame label="Scale · Channel Rings">
      <div className="flex items-center justify-around w-full max-w-lg">
        {rings.map((r, i) => {
          const C = 2 * Math.PI * 22;
          return (
            <div key={r.l} className="flex flex-col items-center gap-2">
              <svg viewBox="0 0 60 60" className="w-16 h-16">
                <circle cx="30" cy="30" r="22" stroke="hsl(var(--primary) / 0.15)" strokeWidth="4" fill="none" />
                <motion.circle
                  cx="30" cy="30" r="22"
                  stroke="hsl(var(--primary))"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  initial={{ strokeDashoffset: C }}
                  animate={{ strokeDashoffset: C - (C * r.pct) / 100 }}
                  transition={{ duration: 1.4, delay: i * 0.15 }}
                  transform="rotate(-90 30 30)"
                />
                <text x="30" y="34" textAnchor="middle" fill="hsl(var(--primary))" fontSize="11" fontFamily="monospace">{r.pct}%</text>
              </svg>
              <div className="text-[10px] uppercase tracking-widest text-primary/70">{r.l}</div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
};

export const AutoPublishRailVisual = () => (
  <Frame label="Scale · Auto-Publish">
    <div className="w-full max-w-lg space-y-2">
      {["TIKTOK", "META", "YOUTUBE", "X"].map((c, i) => (
        <motion.div
          key={c}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.15 }}
          className="flex items-center gap-3 h-9 rounded border border-primary/25 bg-primary/5 px-3"
        >
          <div className="text-[10px] uppercase tracking-widest text-primary w-20">{c}</div>
          <div className="flex-1 h-1 bg-primary/10 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 1, delay: 0.2 + i * 0.15 }}
              className="h-full bg-gradient-to-r from-primary to-gold-dark"
            />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-primary/80">QUEUED</div>
        </motion.div>
      ))}
    </div>
  </Frame>
);

export const CloneMultiplierVisual = () => (
  <Frame label="Scale · Clone × N">
    <div className="flex items-center gap-6">
      <div className="w-16 h-20 rounded border border-primary/50 bg-primary/10 flex items-center justify-center">
        <Copy className="h-6 w-6 text-primary" />
      </div>
      <div className="text-primary text-2xl font-display">×</div>
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 0.9, scale: 1 }}
            transition={{ delay: i * 0.08 }}
            className="w-6 h-8 rounded border border-primary/40 bg-gradient-to-b from-primary/30 to-transparent"
          />
        ))}
      </div>
    </div>
  </Frame>
);

export const QueueRocketVisual = () => (
  <Frame label="Scale · Queue → Live">
    <div className="w-full max-w-md space-y-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-primary/70">
        <ListChecks className="h-3 w-3" /> QUEUE · 12
      </div>
      <div className="relative h-24 rounded border border-primary/25 bg-primary/5 overflow-hidden">
        <motion.div
          animate={{ x: ["-20%", "120%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeIn" }}
          className="absolute top-1/2 -translate-y-1/2 flex items-center gap-2"
        >
          <Rocket className="h-8 w-8 text-primary" />
          <div className="h-px w-16 bg-gradient-to-r from-primary to-transparent" />
        </motion.div>
      </div>
      <div className="flex justify-between text-[9px] uppercase tracking-widest text-primary/60">
        <span>DRAFT</span><span>REVIEW</span><span>LIVE</span>
      </div>
    </div>
  </Frame>
);

export const GlobalReachMapVisual = () => (
  <Frame label="Scale · Global Reach">
    <div className="relative">
      <Globe2 className="h-32 w-32 text-primary/60" strokeWidth={1} />
      {[
        { x: 10, y: 20 },
        { x: 60, y: 15 },
        { x: 80, y: 55 },
        { x: 30, y: 70 },
        { x: 55, y: 40 },
      ].map((p, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0.7], scale: [0, 1.4, 1] }}
          transition={{ delay: i * 0.3, duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
          className="absolute w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
        />
      ))}
    </div>
  </Frame>
);
