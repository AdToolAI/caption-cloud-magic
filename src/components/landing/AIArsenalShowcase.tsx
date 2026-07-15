import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Film, Image as ImageIcon, Volume2, UserSquare2, Star,
  ChevronRight, Zap,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { Language } from "@/lib/translations";
import {
  ARSENAL_CATALOG, getModelsByCategory, getCoverForModel,
  CATEGORY_ORDER, CATEGORY_COUNTS, TOTAL_MODELS,
  type ArsenalCategory, type ArsenalModel,
} from "./ai-arsenal/arsenalCatalog";

type Category = "all" | ArsenalCategory;

const CATEGORY_ICONS = {
  all: Sparkles,
  video: Film,
  image: ImageIcon,
  audio: Volume2,
  avatar: UserSquare2,
} as const;

const SLIDE_MS = 5200;

export const AIArsenalShowcase = () => {
  const { t, language } = useTranslation() as { t: any; language: Language };
  const [active, setActive] = useState<Category>("video");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [transitionKey, setTransitionKey] = useState(0);
  const timerRef = useRef<number | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const models = useMemo(() => {
    if (active === "all") return ARSENAL_CATALOG;
    return getModelsByCategory(active);
  }, [active]);

  const current = models[index] ?? models[0];
  const displayCategory: ArsenalCategory = active === "all" ? current?.category ?? "video" : active;

  // Reset when category changes
  useEffect(() => {
    setIndex(0);
    setDirection(1);
    setTransitionKey((k) => k + 1);
  }, [active]);

  // Auto-advance
  useEffect(() => {
    if (paused || models.length <= 1) return;
    const start = performance.now();
    const tick = () => {
      const el = progressRef.current;
      if (el) {
        const elapsed = performance.now() - start;
        el.style.width = `${Math.min(100, (elapsed / SLIDE_MS) * 100)}%`;
      }
      timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);
    const to = window.setTimeout(() => {
      setDirection(1);
      setTransitionKey((k) => k + 1);
      setIndex((i) => (i + 1) % models.length);
    }, SLIDE_MS);
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      window.clearTimeout(to);
      if (progressRef.current) progressRef.current.style.width = "0%";
    };
  }, [paused, index, models.length]);

  const jumpTo = useCallback((i: number) => {
    setDirection(i > index ? 1 : -1);
    setTransitionKey((k) => k + 1);
    setIndex(i);
  }, [index]);

  return (
    <section className="py-24 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/10 to-background" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full bg-primary/10 blur-[160px] pointer-events-none" />

      <div className="container relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4 border border-primary/30">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            {t("landing.aiArsenal.badge")}
          </div>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            <span className="text-foreground">{TOTAL_MODELS}+ {language === "de" ? "lizensierte " : language === "es" ? "licenciados " : "licensed "}</span>
            <span className="bg-gradient-to-r from-primary via-gold-dark to-primary bg-clip-text text-transparent">
              {t("landing.aiArsenal.title2")}
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t("landing.aiArsenal.subtitle")}
          </p>
        </motion.div>

        {/* Category tabs */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex flex-wrap items-center justify-center gap-2 md:gap-3 mb-8"
        >
          {(["all", ...CATEGORY_ORDER] as Category[]).map((c) => {
            const Icon = CATEGORY_ICONS[c];
            const isActive = active === c;
            const count = c === "all" ? TOTAL_MODELS : CATEGORY_COUNTS[c];
            return (
              <button
                key={c}
                onClick={() => setActive(c)}
                className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 border ${
                  isActive
                    ? "bg-primary/15 text-primary border-primary/60 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.6)]"
                    : "bg-card/40 text-muted-foreground border-border/40 hover:border-primary/30 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(`landing.aiArsenal.categories.${c}`)}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-primary/20 text-primary" : "bg-foreground/5 text-muted-foreground"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </motion.div>

        {/* Stage + Rail */}
        <div
          className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 md:gap-6"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <ArsenalHeroStage
            key={`${active}-stage`}
            model={current}
            language={language}
            t={t}
            direction={direction}
            transitionKey={transitionKey}
            categoryForTransition={displayCategory}
            progressRef={progressRef}
            paused={paused}
            onTogglePause={() => setPaused((p) => !p)}
            onNext={() => jumpTo((index + 1) % models.length)}
            index={index}
            total={models.length}
          />
          <ArsenalModelRail
            models={models}
            activeIndex={index}
            language={language}
            onSelect={jumpTo}
          />
        </div>
      </div>
    </section>
  );
};

// ==================== HERO STAGE ====================
interface HeroStageProps {
  model: ArsenalModel;
  language: Language;
  t: (key: string) => string;
  direction: 1 | -1;
  transitionKey: number;
  categoryForTransition: ArsenalCategory;
  progressRef: React.MutableRefObject<HTMLDivElement | null>;
  paused: boolean;
  onTogglePause: () => void;
  onNext: () => void;
  index: number;
  total: number;
}

const ArsenalHeroStage = ({
  model, language, t, direction, transitionKey, categoryForTransition,
  progressRef, paused, onTogglePause, onNext, index, total,
}: HeroStageProps) => {
  if (!model) return null;
  const cover = getCoverForModel(model);
  const caps = model.caps[language] ?? model.caps.en;

  return (
    <div className="relative rounded-3xl overflow-hidden border border-border/50 bg-card/40 aspect-[16/10] md:aspect-[16/9] lg:aspect-auto lg:min-h-[520px]">
      {/* Slides */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={transitionKey}
          initial={{ opacity: 0, scale: 1.04, x: direction === 1 ? 40 : -40 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.98, x: direction === 1 ? -40 : 40 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-transparent to-transparent" />

          {/* Category-specific signature transition overlay */}
          <SignatureTransition key={`sig-${transitionKey}`} category={categoryForTransition} />
        </motion.div>
      </AnimatePresence>

      {/* Top row: category chip + progress */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold text-primary bg-primary/10 border border-primary/40 px-2.5 py-1 rounded-full">
          {(() => { const Icon = CATEGORY_ICONS[categoryForTransition]; return <Icon className="h-3 w-3" />; })()}
          {t(`landing.aiArsenal.categories.${categoryForTransition}`)}
        </span>
        {model.recommended && (
          <span className="inline-flex items-center gap-1 bg-gradient-to-r from-primary to-gold-dark text-primary-foreground text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shadow-lg">
            <Star className="h-2.5 w-2.5 fill-current" />
            {t("landing.aiArsenal.recommended")}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[10px] font-mono text-muted-foreground/80 tabular-nums">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>

      {/* Bottom content */}
      <div className="absolute inset-x-0 bottom-0 z-20 p-5 md:p-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`text-${transitionKey}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <h3 className="font-display text-2xl md:text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-2">
              {model.name[language] ?? model.name.en}
            </h3>
            <p className="text-muted-foreground md:text-lg max-w-xl mb-4">
              {model.tagline[language] ?? model.tagline.en}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {caps.map((c) => (
                <span
                  key={c}
                  className="text-[10px] md:text-[11px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-foreground/5 text-foreground/80 border border-border/40 backdrop-blur-sm"
                >
                  {c}
                </span>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Progress + Next */}
        <div className="mt-5 flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-foreground/10 overflow-hidden">
            <div
              ref={progressRef}
              className="h-full bg-gradient-to-r from-primary to-gold-dark"
              style={{ width: "0%", transition: paused ? "none" : "width 80ms linear" }}
            />
          </div>
          <button
            onClick={onNext}
            aria-label="Next"
            className="w-9 h-9 rounded-full border border-border/60 bg-background/50 backdrop-blur-md text-foreground/80 hover:text-primary hover:border-primary/40 transition-colors flex items-center justify-center"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== SIGNATURE TRANSITIONS ====================
const SignatureTransition = ({ category }: { category: ArsenalCategory }) => {
  switch (category) {
    case "video": return <FilmstripWipe />;
    case "image": return <DiffusionReveal />;
    case "audio": return <WaveformMorph />;
    case "avatar": return <FaceSwapGrid />;
  }
};

// Filmstrip sprocket wipe — video
const FilmstripWipe = () => (
  <motion.div
    initial={{ x: "-100%" }}
    animate={{ x: "100%" }}
    transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
    className="absolute inset-0 pointer-events-none"
  >
    <div className="absolute top-0 left-0 right-0 h-6 flex gap-2 px-2 items-center bg-black/60">
      {Array.from({ length: 24 }).map((_, i) => (
        <span key={i} className="w-4 h-3 rounded-sm bg-primary/70" />
      ))}
    </div>
    <div className="absolute bottom-0 left-0 right-0 h-6 flex gap-2 px-2 items-center bg-black/60">
      {Array.from({ length: 24 }).map((_, i) => (
        <span key={i} className="w-4 h-3 rounded-sm bg-primary/70" />
      ))}
    </div>
    <div className="absolute inset-y-6 left-0 w-1/3 bg-gradient-to-r from-black/80 to-transparent" />
  </motion.div>
);

// Diffusion pixel reveal — image
const DiffusionReveal = () => (
  <motion.div
    initial={{ opacity: 0.9 }}
    animate={{ opacity: 0 }}
    transition={{ duration: 0.9, ease: "easeOut" }}
    className="absolute inset-0 pointer-events-none"
    style={{
      backgroundImage:
        "radial-gradient(circle at 20% 30%, hsl(var(--primary)/0.4), transparent 45%), radial-gradient(circle at 70% 60%, hsl(var(--primary)/0.35), transparent 40%), repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.06) 0deg 4deg, transparent 4deg 8deg)",
      filter: "blur(1px)",
    }}
  />
);

// Waveform morph — audio
const WaveformMorph = () => (
  <div className="absolute inset-x-0 top-1/3 h-24 flex items-center justify-center gap-[3px] pointer-events-none opacity-70">
    {Array.from({ length: 48 }).map((_, i) => (
      <motion.span
        key={i}
        initial={{ scaleY: 0.2 }}
        animate={{ scaleY: [0.2, Math.random() * 1 + 0.3, 0.2] }}
        transition={{ duration: 0.9, delay: i * 0.012, ease: "easeInOut" }}
        className="w-[3px] h-16 rounded-full bg-gradient-to-t from-primary/70 to-primary/20 origin-center"
      />
    ))}
  </div>
);

// Face swap grid — avatar
const FaceSwapGrid = () => (
  <motion.div
    initial={{ opacity: 1 }}
    animate={{ opacity: 0 }}
    transition={{ duration: 0.9 }}
    className="absolute inset-0 grid grid-cols-8 grid-rows-5 pointer-events-none"
  >
    {Array.from({ length: 40 }).map((_, i) => (
      <motion.div
        key={i}
        initial={{ rotateY: 0, background: "rgba(0,0,0,0.55)" }}
        animate={{ rotateY: 180, background: "rgba(0,0,0,0)" }}
        transition={{ duration: 0.55, delay: (i % 8) * 0.05 + Math.floor(i / 8) * 0.04 }}
        style={{ transformStyle: "preserve-3d" }}
        className="border border-primary/10"
      />
    ))}
  </motion.div>
);

// ==================== MODEL RAIL ====================
const ArsenalModelRail = ({
  models, activeIndex, language, onSelect,
}: {
  models: ArsenalModel[];
  activeIndex: number;
  language: Language;
  onSelect: (i: number) => void;
}) => {
  return (
    <div className="rounded-3xl border border-border/50 bg-card/40 backdrop-blur-sm p-2 max-h-[520px] overflow-y-auto scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent">
      <div className="px-2 py-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
        <Zap className="h-3 w-3 text-primary/70" />
        <span>{models.length} Models</span>
      </div>
      <div className="space-y-1">
        {models.map((m, i) => {
          const isActive = i === activeIndex;
          const Icon = CATEGORY_ICONS[m.category];
          return (
            <button
              key={m.id}
              onClick={() => onSelect(i)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all border ${
                isActive
                  ? "bg-primary/10 border-primary/50 shadow-[0_0_20px_-8px_hsl(var(--primary)/0.6)]"
                  : "border-transparent hover:bg-foreground/[0.04] hover:border-border/40"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center border ${
                isActive ? "bg-primary/20 border-primary/50 text-primary" : "bg-foreground/5 border-border/40 text-muted-foreground"
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold truncate ${isActive ? "text-primary" : "text-foreground"}`}>
                  {m.name[language] ?? m.name.en}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                  {(m.caps[language] ?? m.caps.en).slice(0, 2).join(" · ")}
                </div>
              </div>
              {m.recommended && <Star className="h-3.5 w-3.5 text-primary fill-current flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AIArsenalShowcase;
