import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Users,
  MessagesSquare,
  Clapperboard,
  Palette,
  Music4,
  Mic,
  ArrowUpRight,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/* ────────────────────────────────────────────────────────────────
   Mini visuals — pure SVG / DOM, no external assets.
   Each one lives inside a tile and animates on view/hover.
   ──────────────────────────────────────────────────────────── */

const CastVisual = () => (
  <div className="relative h-full w-full flex items-center justify-center">
    <svg viewBox="0 0 240 120" className="w-full h-full">
      <defs>
        <linearGradient id="cw-gold" x1="0" x2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
          <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {/* portrait chips */}
      {[40, 100, 160].map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy={40} r={18} fill="hsl(var(--card))" stroke="url(#cw-gold)" strokeWidth={1.2} />
          <circle cx={cx} cy={35} r={5} fill="hsl(var(--primary) / 0.7)" />
          <path d={`M${cx - 8},48 Q${cx},44 ${cx + 8},48`} stroke="hsl(var(--primary) / 0.7)" strokeWidth={1.3} fill="none" />
          {/* link */}
          <line x1={cx} y1={58} x2={40 + i * 60} y2={90} stroke="hsl(var(--primary) / 0.35)" strokeWidth={0.8} strokeDasharray="2 3" />
        </g>
      ))}
      {/* scene tiles */}
      {[20, 80, 140, 200].map((x, i) => (
        <rect
          key={x}
          x={x}
          y={92}
          width={22}
          height={16}
          rx={2}
          fill="hsl(var(--primary) / 0.12)"
          stroke="hsl(var(--primary) / 0.35)"
          strokeWidth={0.6}
        >
          <animate
            attributeName="fill-opacity"
            values="0.4;1;0.4"
            dur="3s"
            begin={`${i * 0.4}s`}
            repeatCount="indefinite"
          />
        </rect>
      ))}
    </svg>
  </div>
);

const MotionVisual = () => (
  <div className="relative h-full w-full flex items-center justify-center">
    <svg viewBox="0 0 240 120" className="w-full h-full">
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${20 + i * 55}, 15)`}>
          <rect width={44} height={70} rx={6} fill="hsl(var(--card))" stroke="hsl(var(--primary) / 0.35)" strokeWidth={0.8} />
          {/* waveform */}
          {[6, 12, 18, 24, 30, 36].map((x, j) => (
            <rect
              key={x}
              x={x}
              y={35}
              width={2}
              height={4}
              rx={1}
              fill="hsl(var(--primary))"
            >
              <animate
                attributeName="height"
                values="4;14;4"
                dur="1.2s"
                begin={`${(i * 0.15 + j * 0.08).toFixed(2)}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="y"
                values="35;30;35"
                dur="1.2s"
                begin={`${(i * 0.15 + j * 0.08).toFixed(2)}s`}
                repeatCount="indefinite"
              />
            </rect>
          ))}
          <circle cx={22} cy={20} r={7} fill="hsl(var(--primary) / 0.25)" />
        </g>
      ))}
      <line x1={10} y1={100} x2={230} y2={100} stroke="hsl(var(--primary) / 0.5)" strokeWidth={1} />
      <circle cx={120} cy={100} r={3} fill="hsl(var(--primary))">
        <animate attributeName="cx" values="10;230;10" dur="4s" repeatCount="indefinite" />
      </circle>
    </svg>
  </div>
);

const EngineOrbitVisual = () => {
  const engines = ["SORA", "KLING", "HAILUO", "VEO", "SEEDANCE", "LUMA"];
  return (
    <div className="relative h-full w-full flex items-center justify-center">
      <div className="relative w-[180px] h-[110px]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-gold-dark flex items-center justify-center shadow-[0_0_24px_hsl(var(--primary)/0.5)]">
            <Clapperboard className="h-5 w-5 text-background" />
          </div>
        </div>
        {engines.map((label, i) => {
          const angle = (i / engines.length) * Math.PI * 2;
          const x = 80 + Math.cos(angle) * 78;
          const y = 52 + Math.sin(angle) * 42;
          return (
            <div
              key={label}
              className="absolute text-[9px] uppercase tracking-widest text-primary/80 font-medium"
              style={{ left: x, top: y, transform: "translate(-50%,-50%)" }}
            >
              {label}
            </div>
          );
        })}
        <svg viewBox="0 0 180 110" className="absolute inset-0 pointer-events-none">
          <ellipse
            cx={80}
            cy={52}
            rx={78}
            ry={42}
            fill="none"
            stroke="hsl(var(--primary) / 0.25)"
            strokeDasharray="2 4"
          />
        </svg>
      </div>
    </div>
  );
};

const StyleFramesVisual = () => {
  const frames = [
    { label: "EDITORIAL" },
    { label: "CINEMATIC" },
    { label: "PORTRAIT" },
    { label: "PRODUCT" },
  ];
  return (
    <div className="relative h-full w-full grid grid-cols-2 grid-rows-2 gap-2 p-2">
      {frames.map((f, i) => (
        <motion.div
          key={f.label}
          initial={{ opacity: 0.6 }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 3, delay: i * 0.5, repeat: Infinity }}
          className="relative rounded-md border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent overflow-hidden"
        >
          <div className="absolute inset-x-1 bottom-1 text-[8px] uppercase tracking-widest text-primary/80">
            {f.label}
          </div>
          <div className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary/60" />
        </motion.div>
      ))}
    </div>
  );
};

const MusicWaveVisual = () => (
  <div className="relative h-full w-full flex flex-col justify-center gap-3 px-3">
    <svg viewBox="0 0 240 60" className="w-full h-14">
      {Array.from({ length: 40 }).map((_, i) => (
        <rect
          key={i}
          x={i * 6}
          y={30 - (Math.sin(i * 0.5) * 12 + 12) / 2}
          width={3}
          height={Math.sin(i * 0.5) * 12 + 14}
          rx={1.5}
          fill="hsl(var(--primary))"
          opacity={0.85}
        >
          <animate
            attributeName="height"
            values={`${Math.sin(i * 0.5) * 8 + 10};${Math.sin(i * 0.5) * 14 + 22};${Math.sin(i * 0.5) * 8 + 10}`}
            dur="1.8s"
            begin={`${(i * 0.04).toFixed(2)}s`}
            repeatCount="indefinite"
          />
        </rect>
      ))}
    </svg>
    <div className="flex justify-between gap-2">
      {["SUNO v5", "UDIO v2", "ELEVEN", "STABLE"].map((n, i) => (
        <div
          key={n}
          className="flex-1 text-center rounded-md border border-primary/25 py-1 text-[8px] uppercase tracking-widest text-primary/85 bg-background/40 animate-pulse"
          style={{ animationDelay: `${i * 0.3}s`, animationDuration: "2.4s" }}
        >
          {n}
        </div>
      ))}
    </div>
  </div>
);

const VoiceLinkVisual = () => (
  <div className="relative h-full w-full flex items-center justify-between px-4">
    <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-primary/30 to-gold-dark/20 border border-primary/40 flex items-center justify-center">
      <Mic className="h-5 w-5 text-primary" />
    </div>
    <svg viewBox="0 0 100 40" className="flex-1 h-10 mx-2">
      {Array.from({ length: 20 }).map((_, i) => (
        <rect
          key={i}
          x={i * 5}
          y={16}
          width={2}
          height={8}
          rx={1}
          fill="hsl(var(--primary))"
        >
          <animate
            attributeName="height"
            values="4;18;4"
            dur="1.4s"
            begin={`${(i * 0.06).toFixed(2)}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="y"
            values="18;11;18"
            dur="1.4s"
            begin={`${(i * 0.06).toFixed(2)}s`}
            repeatCount="indefinite"
          />
        </rect>
      ))}
    </svg>
    <div className="flex flex-col gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-8 h-8 rounded-full border border-primary/40 bg-background/60 flex items-center justify-center"
        >
          <div className="w-3 h-3 rounded-full bg-primary/60" />
        </div>
      ))}
    </div>
  </div>
);

/* ────────────────────────────────────────────────────────────────
   Bento grid
   ──────────────────────────────────────────────────────────── */

export const CapabilityBento = () => {
  const { t } = useTranslation();

  const tiles = [
    {
      key: "cast",
      icon: Users,
      href: "/brand-characters",
      Visual: CastVisual,
      chip: "Nano Banana 2 · Seedream 4 · Gemini 3 Pro",
    },
    {
      key: "motion",
      icon: MessagesSquare,
      href: "/motion-studio",
      Visual: MotionVisual,
      chip: "Kling Omni · Hailuo · Sync.so · AWS Rekognition",
    },
    {
      key: "video",
      icon: Clapperboard,
      href: "/ai-video-studio",
      Visual: EngineOrbitVisual,
      chip: "32 Models · 1 Interface",
    },
    {
      key: "picture",
      icon: Palette,
      href: "/picture-studio",
      Visual: StyleFramesVisual,
      chip: "Nano Banana 2 · Seedream 4 · Flux Ultra",
    },
    {
      key: "music",
      icon: Music4,
      href: "/music-studio",
      Visual: MusicWaveVisual,
      chip: "Suno v5 · Udio v2 · ElevenLabs · Stable Audio 2",
    },
    {
      key: "voice",
      icon: Mic,
      href: "/audio-studio",
      Visual: VoiceLinkVisual,
      chip: "ElevenLabs · Cast-Binding",
    },
  ] as const;

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
      {tiles.map((tile, i) => (
        <motion.div
          key={tile.key}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5, delay: i * 0.06 }}
          whileHover={{ y: -4 }}
        >
          <Link
            to={tile.href}
            className="group relative flex flex-col h-full rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl overflow-hidden hover:border-primary/50 hover:shadow-[0_0_30px_hsl(var(--primary)/0.25)] transition-all duration-500"
          >
            {/* accent underline on hover */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-gold-dark scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500" />

            {/* Visual well */}
            <div className="relative h-36 bg-gradient-to-b from-background/40 to-background/10 border-b border-primary/10 overflow-hidden">
              <tile.Visual />
              <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.25em] text-accent/90">
                <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />
                {t("landing.mission.betaPreview")}
              </div>
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowUpRight className="h-4 w-4 text-primary" />
              </div>
            </div>

            {/* Body */}
            <div className="p-5 flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center">
                  <tile.icon className="h-4 w-4 text-primary" />
                </div>
                <h4 className="font-display text-lg leading-tight text-foreground group-hover:text-primary transition-colors">
                  {t(`landing.mission.bento.${tile.key}.title`)}
                </h4>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                {t(`landing.mission.bento.${tile.key}.desc`)}
              </p>
              <div className="mt-4 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/70">
                <span className="w-1 h-1 rounded-full bg-primary" />
                {tile.chip}
              </div>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
};
