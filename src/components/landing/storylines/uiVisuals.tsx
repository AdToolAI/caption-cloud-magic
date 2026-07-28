import { motion } from "framer-motion";
import { Lock, Palette, Mic, Users, Sparkles, Clapperboard, Coins, Music4, Layers3, Guitar, HeartPulse, Library } from "lucide-react";

/* Shared frame — dark glass, gold hairline */
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

/* ─── CAST ─── */

export const CastLockVisual = () => (
  <Frame label="Cast · Identity Lock">
    <div className="flex items-center gap-8">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.15 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-gold-dark/10 border border-primary/40 flex items-center justify-center">
            <Users className="h-8 w-8 text-primary/80" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary/90 flex items-center justify-center border-2 border-background">
              <Lock className="h-3 w-3 text-background" />
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-primary/70">CH·{i + 1}</div>
        </motion.div>
      ))}
    </div>
  </Frame>
);

export const CastLooksVisual = () => (
  <Frame label="Cast · Looks">
    <div className="grid grid-cols-4 gap-3 w-full">
      {["BUSINESS", "CASUAL", "UNIFORM", "EVENING"].map((label, i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 3, delay: i * 0.4, repeat: Infinity }}
          className="aspect-[3/4] rounded-md border border-primary/25 bg-gradient-to-b from-primary/15 to-transparent flex items-end p-2"
        >
          <div className="text-[8px] uppercase tracking-widest text-primary/80">{label}</div>
        </motion.div>
      ))}
    </div>
  </Frame>
);

export const CastVoiceBindVisual = () => (
  <Frame label="Cast · Voice Binding">
    <div className="flex items-center justify-between w-full max-w-md">
      <div className="w-16 h-16 rounded-full border border-primary/40 bg-primary/10 flex items-center justify-center">
        <Users className="h-6 w-6 text-primary/80" />
      </div>
      <div className="flex-1 relative h-1 mx-4 bg-primary/20 rounded-full">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-gold-dark rounded-full"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary bg-background rounded-full" />
        </div>
      </div>
      <div className="w-16 h-16 rounded-full border border-primary/40 bg-primary/10 flex items-center justify-center">
        <Mic className="h-6 w-6 text-primary/80" />
      </div>
    </div>
  </Frame>
);

/* ─── MOTION ─── */

export const MotionTimelineVisual = () => (
  <Frame label="Motion · Speaker Timeline">
    <div className="w-full space-y-2">
      {[
        { c: "S1", w: "25%", l: "0%" },
        { c: "S2", w: "30%", l: "22%" },
        { c: "S3", w: "20%", l: "50%" },
        { c: "S4", w: "28%", l: "72%" },
      ].map((row, i) => (
        <div key={i} className="relative h-6 rounded bg-primary/5 border border-primary/15">
          <div className="absolute inset-y-0 left-2 flex items-center text-[9px] uppercase tracking-widest text-primary/70">
            {row.c}
          </div>
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: i * 0.15, duration: 0.6 }}
            style={{ left: row.l, width: row.w, transformOrigin: "left" }}
            className="absolute top-1 bottom-1 rounded bg-gradient-to-r from-primary/70 to-gold-dark/70"
          />
        </div>
      ))}
      <div className="relative h-px bg-primary/40 mt-3">
        <motion.div
          className="absolute -top-1 h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
          animate={{ left: ["0%", "100%"] }}
          transition={{ duration: 4, repeat: Infinity }}
        />
      </div>
    </div>
  </Frame>
);

export const MotionKlingVisual = () => (
  <Frame label="Motion · Kling Omni">
    <div className="flex flex-col items-center gap-4">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-gold-dark flex items-center justify-center shadow-[0_0_28px_hsl(var(--primary)/0.5)]">
        <Clapperboard className="h-6 w-6 text-background" />
      </div>
      <div className="flex gap-2 flex-wrap justify-center">
        {["KLING OMNI", "SYNC.SO", "AWS REKOGNITION", "HAILUO"].map((chip, i) => (
          <motion.div
            key={chip}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="text-[9px] uppercase tracking-widest text-primary/85 border border-primary/30 rounded-full px-3 py-1 bg-background/40"
          >
            {chip}
          </motion.div>
        ))}
      </div>
    </div>
  </Frame>
);

export const MotionOneTakeVisual = () => (
  <Frame label="Motion · One Take">
    <div className="w-full">
      <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-primary/60 mb-2">
        <span>0:00</span>
        <span>NO CUTS</span>
        <span>0:15</span>
      </div>
      <div className="relative h-8 rounded bg-primary/10 border border-primary/25 overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/50 via-gold-dark/50 to-primary/50"
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: 4, repeat: Infinity }}
        />
        {[25, 50, 75].map((p) => (
          <div key={p} className="absolute top-0 bottom-0 w-px bg-primary/30" style={{ left: `${p}%` }} />
        ))}
      </div>
      <div className="mt-3 text-[10px] uppercase tracking-widest text-primary/70 text-center">
        Continuous shot · 4 speakers · 1 identity lock
      </div>
    </div>
  </Frame>
);

/* ─── VIDEO ─── */

export const VideoProviderSwitchVisual = () => (
  <Frame label="AI Video · Provider Switch">
    <div className="grid grid-cols-3 gap-3 w-full">
      {["SORA", "KLING", "HAILUO", "VEO", "SEEDANCE", "LUMA"].map((p, i) => (
        <motion.div
          key={p}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2.4, delay: i * 0.25, repeat: Infinity }}
          className="rounded-md border border-primary/25 bg-background/40 py-3 text-center text-[10px] uppercase tracking-widest text-primary/85"
        >
          {p}
        </motion.div>
      ))}
    </div>
  </Frame>
);

export const VideoStylePresetsVisual = () => (
  <Frame label="AI Video · Style Presets">
    <div className="grid grid-cols-2 gap-3 w-full">
      {["EDITORIAL", "CINEMATIC", "PRODUCT", "UGC"].map((s, i) => (
        <motion.div
          key={s}
          initial={{ opacity: 0, x: i % 2 === 0 ? -10 : 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.12 }}
          className="aspect-video rounded-md border border-primary/25 bg-gradient-to-br from-primary/15 to-transparent p-3 flex items-end"
        >
          <div className="text-[10px] uppercase tracking-widest text-primary/85">{s}</div>
        </motion.div>
      ))}
    </div>
  </Frame>
);

export const VideoCostVisual = () => (
  <Frame label="AI Video · Cost Preview">
    <div className="w-full max-w-sm space-y-3">
      {[
        { l: "Video", c: 420, e: "€4,20" },
        { l: "Lip-Sync", c: 640, e: "€6,40" },
        { l: "Music", c: 80, e: "€0,80" },
      ].map((row, i) => (
        <motion.div
          key={row.l}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.15 }}
          className="flex items-center justify-between rounded border border-primary/25 bg-background/50 px-3 py-2"
        >
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-primary/80">
            <Coins className="h-3.5 w-3.5" /> {row.l}
          </div>
          <div className="text-sm text-primary font-medium tabular-nums">{row.c} <span className="text-primary/60 text-[10px]">Cr · {row.e}</span></div>
        </motion.div>
      ))}
    </div>
  </Frame>
);

/* ─── PICTURE ─── */

export const PictureAnchorVisual = () => (
  <Frame label="Picture · Brand Anchor">
    <div className="flex items-center gap-6">
      <div className="w-24 h-24 rounded-lg bg-gradient-to-br from-primary/40 to-gold-dark/20 border border-primary/40 flex items-center justify-center">
        <Palette className="h-8 w-8 text-primary/80" />
      </div>
      <div className="flex flex-col gap-2">
        {["#0A0A12", "#F5C76A", "#1F1F2E", "#8A6D2C"].map((hex, i) => (
          <motion.div
            key={hex}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-primary/75"
          >
            <span className="w-4 h-4 rounded" style={{ background: hex }} />
            {hex}
          </motion.div>
        ))}
      </div>
    </div>
  </Frame>
);

export const PictureStyleGridVisual = () => (
  <Frame label="Picture · Style Grid">
    <div className="grid grid-cols-2 gap-2 w-full">
      {["EDITORIAL", "CINEMATIC", "PORTRAIT", "PRODUCT"].map((label, i) => (
        <motion.div
          key={label}
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 3, delay: i * 0.4, repeat: Infinity }}
          className="aspect-[4/3] rounded-md border border-primary/25 bg-gradient-to-br from-primary/15 via-transparent to-primary/5 p-2 flex items-end"
        >
          <div className="text-[9px] uppercase tracking-widest text-primary/85">{label}</div>
        </motion.div>
      ))}
    </div>
  </Frame>
);

export const PictureUpscaleVisual = () => (
  <Frame label="Picture · Upscale 4K">
    <div className="w-full flex items-center gap-4">
      <div className="w-20 h-20 rounded border border-primary/30 bg-primary/10 flex flex-col items-center justify-center text-[9px] uppercase tracking-widest text-primary/75">
        <span className="text-primary/60 text-[8px]">1024×</span>
        <span>SOURCE</span>
      </div>
      <motion.div
        animate={{ x: [0, 6, 0] }}
        transition={{ duration: 1.4, repeat: Infinity }}
        className="text-primary text-2xl"
      >
        →
      </motion.div>
      <div className="w-32 h-32 rounded border border-primary/50 bg-gradient-to-br from-primary/20 to-gold-dark/10 flex flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-widest text-primary shadow-[0_0_24px_hsl(var(--primary)/0.35)]">
        <Sparkles className="h-4 w-4" />
        <span>4K READY</span>
        <span className="text-primary/60 text-[8px]">4096×</span>
      </div>
    </div>
  </Frame>
);

/* ─── MUSIC ─── */

export const MusicWaveformVisual = () => (
  <Frame label="Music · 4 Engines · 1 Waveform">
    <div className="w-full space-y-2">
      {["SUNO V5", "UDIO V2", "ELEVENLABS", "STABLE AUDIO"].map((e, i) => (
        <div key={e} className="flex items-center gap-3">
          <div className="w-24 text-[9px] uppercase tracking-widest text-primary/75">{e}</div>
          <svg viewBox="0 0 200 20" className="flex-1 h-5">
            {Array.from({ length: 40 }).map((_, k) => (
              <rect
                key={k}
                x={k * 5}
                y={10 - (Math.sin(k * 0.6 + i) * 6 + 6) / 2}
                width={2.5}
                height={Math.sin(k * 0.6 + i) * 6 + 8}
                rx={1}
                fill="hsl(var(--primary))"
                opacity={0.75}
              >
                <animate
                  attributeName="height"
                  values={`${Math.sin(k * 0.6 + i) * 4 + 6};${Math.sin(k * 0.6 + i) * 8 + 12};${Math.sin(k * 0.6 + i) * 4 + 6}`}
                  dur="1.6s"
                  begin={`${(k * 0.03 + i * 0.1).toFixed(2)}s`}
                  repeatCount="indefinite"
                />
              </rect>
            ))}
          </svg>
        </div>
      ))}
    </div>
  </Frame>
);

export const MusicStemsVisual = () => (
  <Frame label="Music · Stems Export">
    <div className="w-full space-y-2">
      {[
        { l: "DRUMS", c: "from-primary/60" },
        { l: "BASS", c: "from-primary/50" },
        { l: "VOCALS", c: "from-primary/70" },
        { l: "FX", c: "from-primary/45" },
      ].map((s, i) => (
        <motion.div
          key={s.l}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.12 }}
          className="flex items-center gap-3"
        >
          <Layers3 className="h-3.5 w-3.5 text-primary/70" />
          <div className="w-16 text-[10px] uppercase tracking-widest text-primary/80">{s.l}</div>
          <div className={`flex-1 h-3 rounded bg-gradient-to-r ${s.c} to-transparent border border-primary/20`} />
        </motion.div>
      ))}
    </div>
  </Frame>
);

export const MusicGenreVisual = () => (
  <Frame label="Music · Genre Switch">
    <div className="flex flex-wrap justify-center gap-2">
      {["CINEMATIC", "LO-FI", "CORPORATE", "TRAP", "AMBIENT", "ORCHESTRAL"].map((g, i) => (
        <motion.div
          key={g}
          animate={{ scale: [1, 1.06, 1], opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 2.4, delay: i * 0.25, repeat: Infinity }}
          className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/85 border border-primary/30 rounded-full px-3 py-1.5 bg-background/40"
        >
          <Guitar className="h-3 w-3" /> {g}
        </motion.div>
      ))}
    </div>
  </Frame>
);

/* ─── VOICE ─── */

export const VoiceCloneVisual = () => (
  <Frame label="Voice · Script Panel">
    <div className="w-full max-w-md space-y-2 text-[11px] text-primary/70 leading-relaxed">
      {[
        "Sprecher 1: Willkommen bei AdTool AI.",
        "Sprecher 2: Vier Stimmen, eine Szene.",
        "Sprecher 3: Kein Lip-Sync verrutscht.",
        "Sprecher 4: Willkommen in der Beta.",
      ].map((line, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0.35 }}
          animate={{ opacity: i === 1 ? 1 : 0.4 }}
          transition={{ duration: 1.2, delay: i * 0.3 }}
          className={`rounded border ${i === 1 ? "border-primary/60 bg-primary/10" : "border-primary/15 bg-background/40"} px-3 py-2`}
        >
          {line}
        </motion.div>
      ))}
    </div>
  </Frame>
);

export const VoiceEmotionVisual = () => (
  <Frame label="Voice · Emotion Control">
    <div className="grid grid-cols-2 gap-3 w-full max-w-md">
      {[
        { l: "FRIENDLY", i: "😊" },
        { l: "URGENT", i: "⚡" },
        { l: "CALM", i: "🌊" },
        { l: "ENERGETIC", i: "🔥" },
      ].map((e, i) => (
        <motion.div
          key={e.l}
          animate={{ borderColor: ["hsl(var(--primary)/0.25)", "hsl(var(--primary)/0.7)", "hsl(var(--primary)/0.25)"] }}
          transition={{ duration: 3, delay: i * 0.35, repeat: Infinity }}
          className="rounded border bg-background/40 px-3 py-2 flex items-center gap-2"
        >
          <HeartPulse className="h-3.5 w-3.5 text-primary/70" />
          <span className="text-[10px] uppercase tracking-widest text-primary/85">{e.l}</span>
        </motion.div>
      ))}
    </div>
  </Frame>
);

export const VoiceLibraryVisual = () => (
  <Frame label="Voice · My Voices">
    <div className="w-full max-w-md space-y-2">
      {[
        { n: "Meine Stimme", tag: "CLONED" },
        { n: "Marcus DE", tag: "ELEVEN" },
        { n: "Sarah EN", tag: "ELEVEN" },
        { n: "Founder Voice", tag: "CLONED" },
      ].map((v, i) => (
        <motion.div
          key={v.n}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="flex items-center gap-3 rounded border border-primary/25 bg-background/50 px-3 py-2"
        >
          <Library className="h-3.5 w-3.5 text-primary/70" />
          <div className="flex-1 text-[11px] text-primary/85">{v.n}</div>
          <div className="text-[8px] uppercase tracking-widest text-primary/60 border border-primary/25 rounded px-1.5 py-0.5">
            {v.tag}
          </div>
        </motion.div>
      ))}
    </div>
  </Frame>
);
