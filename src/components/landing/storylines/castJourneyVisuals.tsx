import { motion } from "framer-motion";
import { Lock, Sparkles, Mic, Film, User, Shirt, Zap, Palette, Waves, ScanFace } from "lucide-react";
import characterSheetHero from "@/assets/landing/storylines/cast/cast-character-sheet-hero.jpg";
import lookStudio from "@/assets/landing/storylines/cast/cast-look-studio.jpg";
import lookStreet from "@/assets/landing/storylines/cast/cast-look-street.jpg";
import lookExecutive from "@/assets/landing/storylines/cast/cast-look-executive.jpg";
import lookEditorial from "@/assets/landing/storylines/cast/cast-look-editorial.jpg";
import anchorPortrait from "@/assets/landing/storylines/cast/cast-anchor-portrait.jpg";
import storyboardTile from "@/assets/landing/storylines/cast/cast-storyboard-tile.jpg";

/* ─────────────────────────────────────────────────────────
   Cast & World — Character Creation Journey visuals
   Pure SVG + Framer Motion. No external assets.
   Each component fills the parent (16:9) container.
   ───────────────────────────────────────────────────────── */

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="relative w-full h-full bg-gradient-to-br from-background via-background/90 to-black overflow-hidden">
    {/* ambient gold grid */}
    <div
      className="absolute inset-0 opacity-[0.07]"
      style={{
        backgroundImage:
          "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    />
    <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
    <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-accent/10 blur-3xl" />
    <div className="relative w-full h-full">{children}</div>
  </div>
);

const StepBadge = ({ n, label }: { n: string; label: string }) => (
  <div className="absolute top-4 left-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-primary/80">
    <div className="w-6 h-6 rounded-full border border-primary/50 flex items-center justify-center font-display text-primary">
      {n}
    </div>
    <span>{label}</span>
  </div>
);

/* ── 1. Brief → Tokens ─────────────────────────────────── */
export const BriefTokensVisual = () => {
  const tokens = ["age: 32", "warmes lächeln", "berlin", "founder", "warm-braun", "sanfte stimme"];
  return (
    <Shell>
      <StepBadge n="01" label="Brief" />
      <div className="absolute inset-0 flex items-center justify-center px-6 md:px-12">
        <div className="grid grid-cols-2 gap-6 w-full max-w-3xl">
          {/* prompt card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-xl border border-primary/25 bg-background/60 backdrop-blur-md p-4"
          >
            <div className="text-[9px] uppercase tracking-widest text-primary/60 mb-2">Brief</div>
            <div className="font-mono text-[11px] leading-relaxed text-foreground/85">
              „Gründerin, 32, warmes Lächeln, Berlin, ruhig-charismatisch, warm-braune Farben."
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[9px] text-primary/70">
              <Sparkles className="h-3 w-3" />
              LLM parsing…
            </div>
          </motion.div>

          {/* character slot */}
          <div className="relative rounded-xl border border-primary/40 bg-gradient-to-br from-primary/10 to-transparent p-4 flex flex-col items-center justify-center min-h-[160px]">
            <div className="absolute top-2 left-2 text-[9px] uppercase tracking-widest text-primary/60">
              Character Slot
            </div>
            <User className="h-10 w-10 text-primary/70 mb-2" />
            <div className="flex flex-wrap gap-1.5 justify-center">
              {tokens.map((t, i) => (
                <motion.span
                  key={t}
                  initial={{ opacity: 0, y: -30, scale: 0.6 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.6 + i * 0.18, type: "spring", stiffness: 220, damping: 18 }}
                  className="px-2 py-0.5 rounded-md text-[9px] bg-primary/15 border border-primary/40 text-primary font-mono"
                >
                  {t}
                </motion.span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
};

/* ── 2. Anchor Portrait — provider chips + morph reveal ── */
export const AnchorMorphVisual = () => {
  const providers = ["Nano Banana 2", "Seedream 4", "Gemini 3 Pro"];
  return (
    <Shell>
      <StepBadge n="02" label="Anchor Portrait" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-[280px] h-[280px] md:w-[320px] md:h-[320px]">
          {/* orbit ring */}
          <svg viewBox="0 0 320 320" className="absolute inset-0 pointer-events-none">
            <circle cx={160} cy={160} r={150} fill="none" stroke="hsl(var(--primary)/0.25)" strokeDasharray="3 6" />
          </svg>

          {/* portrait frame */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0, filter: "blur(20px)" }}
            animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 1.4, ease: "easeOut" }}
            className="absolute inset-8 rounded-2xl overflow-hidden border-2 border-primary/60 shadow-[0_0_40px_hsl(var(--primary)/0.5)]"
          >
            {/* stylized portrait */}
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <defs>
                <radialGradient id="face-grad" cx="0.5" cy="0.4">
                  <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
                  <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
                </radialGradient>
                <linearGradient id="bg-grad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#1a1208" />
                  <stop offset="1" stopColor="#050303" />
                </linearGradient>
              </defs>
              <rect width={200} height={200} fill="url(#bg-grad)" />
              {/* hair */}
              <ellipse cx={100} cy={82} rx={58} ry={54} fill="hsl(var(--primary)/0.55)" />
              {/* face */}
              <ellipse cx={100} cy={100} rx={44} ry={54} fill="url(#face-grad)" />
              {/* neck */}
              <rect x={82} y={148} width={36} height={40} rx={12} fill="hsl(var(--primary)/0.35)" />
              {/* shoulders */}
              <path d="M20,200 Q100,150 180,200 L180,200 L20,200 Z" fill="hsl(var(--primary)/0.25)" />
              {/* eyes */}
              <circle cx={86} cy={100} r={2.6} fill="#050303" />
              <circle cx={114} cy={100} r={2.6} fill="#050303" />
              {/* smile */}
              <path d="M86,124 Q100,132 114,124" stroke="#050303" strokeWidth={1.6} fill="none" strokeLinecap="round" />
            </svg>
            {/* scan line */}
            <motion.div
              className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-primary/30 to-transparent"
              initial={{ top: "-10%" }}
              animate={{ top: "110%" }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>

          {/* provider chips orbiting */}
          {providers.map((p, i) => {
            const angle = (i / providers.length) * Math.PI * 2 - Math.PI / 2;
            const x = 160 + Math.cos(angle) * 150;
            const y = 160 + Math.sin(angle) * 150;
            return (
              <motion.div
                key={p}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 + i * 0.2 }}
                className="absolute px-2.5 py-1 rounded-full bg-background/80 border border-primary/50 backdrop-blur text-[9px] uppercase tracking-widest text-primary font-medium whitespace-nowrap"
                style={{ left: x, top: y, transform: "translate(-50%,-50%)" }}
              >
                {p}
              </motion.div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
};

/* ── 3. Identity Lock — face landmarks + biometric ─────── */
export const IdentityLockVisual = () => {
  const landmarks = [
    // eyes
    { x: 86, y: 100 }, { x: 114, y: 100 },
    // eyebrows
    { x: 80, y: 92 }, { x: 92, y: 90 }, { x: 108, y: 90 }, { x: 120, y: 92 },
    // nose
    { x: 100, y: 112 }, { x: 100, y: 118 },
    // mouth
    { x: 88, y: 128 }, { x: 100, y: 130 }, { x: 112, y: 128 },
    // jaw
    { x: 70, y: 130 }, { x: 100, y: 148 }, { x: 130, y: 130 },
  ];
  return (
    <Shell>
      <StepBadge n="03" label="Identity Lock" />
      <div className="absolute inset-0 flex items-center justify-center gap-8 px-8">
        {/* face + landmarks */}
        <div className="relative w-[240px] h-[240px] rounded-2xl overflow-hidden border-2 border-primary/60 shadow-[0_0_40px_hsl(var(--primary)/0.4)]">
          <svg viewBox="0 0 200 200" className="w-full h-full">
            <rect width={200} height={200} fill="#0a0704" />
            <ellipse cx={100} cy={82} rx={58} ry={54} fill="hsl(var(--primary)/0.55)" />
            <ellipse cx={100} cy={100} rx={44} ry={54} fill="hsl(var(--primary)/0.35)" />
            <rect x={82} y={148} width={36} height={40} rx={12} fill="hsl(var(--primary)/0.3)" />
            {/* landmarks */}
            {landmarks.map((lm, i) => (
              <motion.circle
                key={i}
                cx={lm.x}
                cy={lm.y}
                r={2.4}
                fill="hsl(var(--primary))"
                stroke="hsl(var(--primary))"
                strokeWidth={0.5}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.06 }}
              />
            ))}
            {/* connecting lines */}
            <motion.path
              d="M80,92 L92,90 M108,90 L120,92 M86,100 L114,100 M100,112 L100,118 M88,128 L100,130 L112,128 M70,130 L100,148 L130,130"
              stroke="hsl(var(--primary)/0.6)"
              strokeWidth={0.8}
              fill="none"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 1.2, duration: 1 }}
            />
          </svg>
          {/* corner brackets */}
          {[
            "top-1 left-1 border-t-2 border-l-2",
            "top-1 right-1 border-t-2 border-r-2",
            "bottom-1 left-1 border-b-2 border-l-2",
            "bottom-1 right-1 border-b-2 border-r-2",
          ].map((cls) => (
            <div key={cls} className={`absolute w-4 h-4 border-primary ${cls}`} />
          ))}
        </div>

        {/* biometric report */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.5, duration: 0.5 }}
          className="rounded-xl border border-primary/40 bg-background/70 backdrop-blur px-5 py-4 min-w-[180px]"
        >
          <div className="flex items-center gap-2 mb-3">
            <Lock className="h-4 w-4 text-primary" />
            <span className="text-[10px] uppercase tracking-widest text-primary">Face ID Lock</span>
          </div>
          <div className="space-y-2 text-[11px] font-mono">
            {[
              ["Match", "98.4%"],
              ["Landmarks", "14 / 14"],
              ["Rekognition", "PASS"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{k}</span>
                <span className="text-primary">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 h-1 rounded-full bg-primary/15 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-gold-dark"
              initial={{ width: 0 }}
              animate={{ width: "98%" }}
              transition={{ delay: 1.7, duration: 1 }}
            />
          </div>
        </motion.div>
      </div>
    </Shell>
  );
};

/* ── 4. Wardrobe / Looks ───────────────────────────────── */
export const WardrobeCarouselVisual = () => {
/* ── 4. Wardrobe — Character Selection Screen (photo-driven) ─── */
export const WardrobeCarouselVisual = () => {
  const looks = [
    { name: "Studio", src: lookStudio, palette: ["#c9a24a", "#1a1208", "#f5eddc"] },
    { name: "Street", src: lookStreet, palette: ["#3a5a7a", "#0a0f1a", "#c9a24a"] },
    { name: "Executive", src: lookExecutive, palette: ["#0a0a0a", "#c9a24a", "#e8e0cc"] },
    { name: "Editorial", src: lookEditorial, palette: ["#8a2a2a", "#1a0808", "#f5eddc"] },
  ];
  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* full-bleed hero character sheet */}
      <img
        src={characterSheetHero}
        alt=""
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* gold grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* vignette to lift bottom chrome */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent pointer-events-none" />

      {/* HUD: step + status */}
      <div className="absolute top-4 left-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-primary/85">
        <div className="w-6 h-6 rounded-full border border-primary/60 flex items-center justify-center font-display text-primary">04</div>
        <span>Wardrobe · Select Look</span>
      </div>
      <div className="absolute top-4 right-4 flex items-center gap-3">
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/40 bg-background/70 backdrop-blur text-[9px] uppercase tracking-widest text-primary">
          <ScanFace className="h-3 w-3" /> ID Lock · 98%
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/40 bg-background/70 backdrop-blur text-[9px] uppercase tracking-widest text-primary">
          <Lock className="h-3 w-3" /> Aurora Vale
        </div>
      </div>
      {/* corner brackets */}
      {[
        "top-2 left-2 border-t-2 border-l-2",
        "top-2 right-2 border-t-2 border-r-2",
        "bottom-2 left-2 border-b-2 border-l-2",
        "bottom-2 right-2 border-b-2 border-r-2",
      ].map((cls) => (
        <div key={cls} className={`absolute w-5 h-5 border-primary/70 ${cls} pointer-events-none`} />
      ))}

      {/* look slot strip (mirrors hero screen, animated) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[92%] max-w-4xl">
        <div className="grid grid-cols-4 gap-2 md:gap-3">
          {looks.map((l, i) => {
            const active = i === 1;
            return (
              <motion.div
                key={l.name}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.12, duration: 0.5 }}
                className={`relative rounded-lg overflow-hidden border ${
                  active
                    ? "border-primary shadow-[0_0_24px_hsl(var(--primary)/0.55)]"
                    : "border-primary/25"
                } bg-background/60 backdrop-blur-sm`}
              >
                <div className="aspect-[3/4] relative">
                  <img
                    src={l.src}
                    alt={l.name}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
                  {active && (
                    <motion.div
                      className="absolute inset-0 border-2 border-primary rounded-lg"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.8, repeat: Infinity }}
                    />
                  )}
                  <div className="absolute top-1.5 left-1.5 text-[8px] md:text-[9px] uppercase tracking-widest text-primary/90 font-medium">
                    Look 0{i + 1}
                  </div>
                  {active && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-sm bg-primary/90 text-black flex items-center justify-center text-[9px] font-bold">
                      ✓
                    </div>
                  )}
                </div>
                <div className="px-2 py-1.5 flex items-center justify-between bg-background/80">
                  <div className="flex items-center gap-1.5">
                    <Shirt className="h-2.5 w-2.5 text-primary/80" />
                    <span className="text-[10px] text-foreground/90 font-medium">{l.name}</span>
                  </div>
                  <div className="flex gap-0.5">
                    {l.palette.map((c) => (
                      <div key={c} className="w-1.5 h-1.5 rounded-full border border-white/10" style={{ background: c }} />
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ── 4b. Character Loadout — RPG-style stat sheet ─────── */
export const CharacterLoadoutVisual = () => {
  const stats = [
    { label: "Identity Match", value: 98, icon: ScanFace },
    { label: "Voice Bind", value: 96, icon: Waves },
    { label: "Wardrobe Presets", value: 100, icon: Palette },
    { label: "Scene Ready", value: 100, icon: Film },
  ];
  const slots = [
    { label: "Face Lock", detail: "AWS Rekognition · 14 pts", icon: Lock },
    { label: "Voice", detail: "ElevenLabs · Anna v2", icon: Mic },
    { label: "Wardrobe", detail: "4 Looks locked", icon: Shirt },
    { label: "Prompt Tokens", detail: "12 tags · frozen", icon: Sparkles },
  ];
  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* character portrait full-bleed */}
      <img
        src={anchorPortrait}
        alt=""
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-black/80" />
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* header */}
      <div className="absolute top-4 left-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-primary/85">
        <div className="w-6 h-6 rounded-full border border-primary/60 flex items-center justify-center font-display text-primary">06</div>
        <span>Character Loadout</span>
      </div>
      <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/40 bg-background/70 backdrop-blur text-[9px] uppercase tracking-widest text-primary">
        <Zap className="h-3 w-3" /> Ready
      </div>

      {/* left column — slot panels */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 space-y-2 w-[38%] max-w-[240px]">
        {slots.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.12, duration: 0.4 }}
            className="rounded-lg border border-primary/35 bg-background/70 backdrop-blur px-3 py-2 flex items-center gap-2.5"
          >
            <div className="w-7 h-7 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
              <s.icon className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-primary/80 font-medium">{s.label}</div>
              <div className="text-[10px] text-foreground/85 truncate">{s.detail}</div>
            </div>
            <Lock className="h-3 w-3 text-primary/70 ml-auto shrink-0" />
          </motion.div>
        ))}
      </div>

      {/* right column — stat bars */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 space-y-2.5 w-[38%] max-w-[240px]">
        {stats.map((st, i) => (
          <motion.div
            key={st.label}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.12, duration: 0.4 }}
            className="rounded-lg border border-primary/30 bg-background/70 backdrop-blur px-3 py-2"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/85">
                <st.icon className="h-3 w-3" />
                {st.label}
              </div>
              <span className="text-[10px] font-mono text-primary">{st.value}%</span>
            </div>
            <div className="h-1 rounded-full bg-primary/15 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-gold-dark"
                initial={{ width: 0 }}
                animate={{ width: `${st.value}%` }}
                transition={{ delay: 0.5 + i * 0.12, duration: 0.9 }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* bottom name plate */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center">
        <div className="text-[9px] uppercase tracking-[0.4em] text-primary/70">Cast · World</div>
        <div className="font-display text-lg md:text-xl text-foreground tracking-tight">Aurora Vale</div>
      </div>

      {/* corner brackets */}
      {[
        "top-2 left-2 border-t-2 border-l-2",
        "top-2 right-2 border-t-2 border-r-2",
        "bottom-2 left-2 border-b-2 border-l-2",
        "bottom-2 right-2 border-b-2 border-r-2",
      ].map((cls) => (
        <div key={cls} className={`absolute w-5 h-5 border-primary/70 ${cls} pointer-events-none`} />
      ))}
    </div>
  );
};

/* ── 5. Voice Binding ──────────────────────────────────── */
export const VoiceBindingVisual = () => (
  <Shell>
    <StepBadge n="05" label="Voice Binding" />
    <div className="absolute inset-0 flex items-center justify-center px-8">
      <div className="flex items-center gap-6 w-full max-w-3xl">
        {/* avatar */}
        <motion.div
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative shrink-0"
        >
          <div className="w-24 h-24 rounded-2xl border-2 border-primary/60 overflow-hidden shadow-[0_0_28px_hsl(var(--primary)/0.35)]">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <rect width={100} height={100} fill="#0a0704" />
              <ellipse cx={50} cy={40} rx={28} ry={26} fill="hsl(var(--primary)/0.55)" />
              <ellipse cx={50} cy={52} rx={22} ry={26} fill="hsl(var(--primary)/0.35)" />
              <rect x={38} y={78} width={24} height={22} rx={6} fill="hsl(var(--primary)/0.3)" />
            </svg>
          </div>
          <div className="mt-1 text-center text-[9px] uppercase tracking-widest text-primary/70">Cast · Anna</div>
        </motion.div>

        {/* linking waveform */}
        <div className="flex-1 relative h-20 flex items-center justify-center">
          <svg viewBox="0 0 300 80" className="w-full h-full">
            {Array.from({ length: 40 }).map((_, i) => {
              const h = 8 + Math.abs(Math.sin(i * 0.5)) * 34;
              return (
                <rect key={i} x={i * 7.5} y={40 - h / 2} width={3} height={h} rx={1.5} fill="hsl(var(--primary))" opacity={0.85}>
                  <animate
                    attributeName="height"
                    values={`${h * 0.5};${h};${h * 0.5}`}
                    dur="1.2s"
                    begin={`${(i * 0.04).toFixed(2)}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="y"
                    values={`${40 - h / 4};${40 - h / 2};${40 - h / 4}`}
                    dur="1.2s"
                    begin={`${(i * 0.04).toFixed(2)}s`}
                    repeatCount="indefinite"
                  />
                </rect>
              );
            })}
          </svg>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest text-primary"
          >
            <Lock className="h-3 w-3" />
            Voice locked to character
          </motion.div>
        </div>

        {/* voice chip */}
        <motion.div
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="shrink-0 rounded-xl border border-primary/50 bg-background/70 backdrop-blur px-4 py-3 min-w-[130px] text-center"
        >
          <Mic className="h-5 w-5 text-primary mx-auto mb-1" />
          <div className="text-[10px] uppercase tracking-widest text-primary/80">ElevenLabs</div>
          <div className="text-xs text-foreground mt-1 font-medium">Anna · v2</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">clone · 60s</div>
        </motion.div>
      </div>
    </div>
  </Shell>
);

/* ── 6. Scene Cast Drop ─────────────────────────────────── */
export const SceneCastDropVisual = () => (
  <Shell>
    <StepBadge n="06" label="Scene Cast" />
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8">
      {/* dragged chip */}
      <motion.div
        initial={{ y: -40, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary bg-primary/15 backdrop-blur shadow-[0_0_24px_hsl(var(--primary)/0.5)]"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-gold-dark" />
        <span className="text-xs text-primary font-medium">Anna · Founder</span>
        <Lock className="h-3 w-3 text-primary" />
      </motion.div>

      {/* storyboard row */}
      <div className="grid grid-cols-3 gap-4 w-full max-w-3xl">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.15 }}
            className="relative rounded-xl border border-primary/30 bg-background/60 overflow-hidden"
          >
            <div className="aspect-[16/10] relative bg-gradient-to-br from-primary/15 via-transparent to-accent/10">
              <svg viewBox="0 0 160 100" className="w-full h-full">
                <rect width={160} height={100} fill="hsl(var(--primary)/0.06)" />
                <circle cx={80} cy={42} r={16} fill="hsl(var(--primary)/0.55)" />
                <path d="M40,100 Q80,55 120,100 Z" fill="hsl(var(--primary)/0.35)" />
              </svg>
              <div className="absolute top-2 left-2 text-[9px] uppercase tracking-widest text-primary/80">
                Scene 0{i + 1}
              </div>
              <div className="absolute bottom-2 right-2 flex items-center gap-1 text-[9px] text-primary/80">
                <User className="h-2.5 w-2.5" /> Anna
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-background/70 backdrop-blur px-4 py-1.5 text-[11px] text-primary uppercase tracking-widest"
      >
        <Film className="h-3.5 w-3.5" />
        Ready for Motion Studio
      </motion.div>
    </div>
  </Shell>
);
