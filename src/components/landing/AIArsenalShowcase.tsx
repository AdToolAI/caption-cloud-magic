import { useState, useMemo } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  Sparkles, Film, Sun, Clapperboard, Zap, Award, Wand2, Image as ImageIcon,
  Music, Mic, UserSquare2, Layers, Palette, Maximize2, Star, Video, Volume2,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import videoHero from "@/assets/landing/ai-arsenal/video-hero.jpg";
import videoKling from "@/assets/landing/ai-arsenal/video-kling.jpg";
import videoSora from "@/assets/landing/ai-arsenal/video-sora.jpg";
import imageHero from "@/assets/landing/ai-arsenal/image-hero.jpg";
import audioHero from "@/assets/landing/ai-arsenal/audio-hero.jpg";
import avatarHero from "@/assets/landing/ai-arsenal/avatar-hero.jpg";

type Category = "all" | "video" | "image" | "audio" | "avatar";

interface Model {
  key: string;
  category: Exclude<Category, "all">;
  icon: typeof Sparkles;
  cover?: string;
  hero?: boolean;
  recommended?: boolean;
  capabilities: string[]; // translation keys under landing.aiArsenal.caps
}

const MODELS: Model[] = [
  // Video
  { key: "kling", category: "video", icon: Sparkles, cover: videoKling, hero: true, recommended: true, capabilities: ["t2v", "i2v", "v2v", "p1080"] },
  { key: "sora", category: "video", icon: Award, cover: videoSora, capabilities: ["t2v", "i2v"] },
  { key: "wan", category: "video", icon: Film, capabilities: ["t2v", "p1080"] },
  { key: "luma", category: "video", icon: Sun, capabilities: ["t2v", "i2v", "camera"] },
  { key: "hailuo", category: "video", icon: Clapperboard, capabilities: ["t2v", "i2v", "director"] },
  { key: "seedance", category: "video", icon: Zap, capabilities: ["t2v", "fast"] },
  { key: "veo", category: "video", icon: Award, capabilities: ["t2v", "p1080"] },
  { key: "pika", category: "video", icon: Video, capabilities: ["t2v", "i2v", "frames"] },
  { key: "vidu", category: "video", icon: Layers, capabilities: ["multiref", "i2v"] },
  { key: "runway", category: "video", icon: Wand2, capabilities: ["v2v"] },
  { key: "happyhorse", category: "video", icon: Sparkles, capabilities: ["t2v", "i2v"] },

  // Image
  { key: "nanoBanana", category: "image", icon: ImageIcon, cover: imageHero, hero: true, recommended: true, capabilities: ["t2i", "edit"] },
  { key: "fluxFill", category: "image", icon: Wand2, capabilities: ["edit", "inpaint"] },
  { key: "clarity", category: "image", icon: Maximize2, capabilities: ["upscale4x"] },
  { key: "styleRef", category: "image", icon: Palette, capabilities: ["styleRef"] },

  // Audio
  { key: "stableAudio", category: "audio", icon: Music, cover: audioHero, hero: true, capabilities: ["music", "sfx"] },
  { key: "miniMax", category: "audio", icon: Music, capabilities: ["vocal", "music"] },
  { key: "elevenLabs", category: "audio", icon: Mic, capabilities: ["voice", "multilang"] },

  // Avatar
  { key: "heygen", category: "avatar", icon: UserSquare2, cover: avatarHero, hero: true, recommended: true, capabilities: ["talkingHead", "lipSync"] },
  { key: "brandLock", category: "avatar", icon: Sparkles, capabilities: ["consistency"] },
];

const CATEGORIES: { key: Category; icon: typeof Sparkles }[] = [
  { key: "all", icon: Sparkles },
  { key: "video", icon: Film },
  { key: "image", icon: ImageIcon },
  { key: "audio", icon: Volume2 },
  { key: "avatar", icon: UserSquare2 },
];

export const AIArsenalShowcase = () => {
  const { t } = useTranslation();
  const [active, setActive] = useState<Category>("all");

  const filtered = useMemo(
    () => (active === "all" ? MODELS : MODELS.filter((m) => m.category === active)),
    [active],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { video: 0, image: 0, audio: 0, avatar: 0 };
    MODELS.forEach((m) => (c[m.category]++));
    return c;
  }, []);

  return (
    <section className="py-24 px-4 relative overflow-hidden">
      {/* Background ambience */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/10 to-background" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-primary/10 blur-[140px] pointer-events-none" />

      <div className="container relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4 border border-primary/30">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            {t("landing.aiArsenal.badge")}
          </div>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            <span className="text-foreground">{t("landing.aiArsenal.title1")}</span>
            <span className="bg-gradient-to-r from-primary via-gold-dark to-primary bg-clip-text text-transparent">
              {t("landing.aiArsenal.title2")}
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t("landing.aiArsenal.subtitle")}
          </p>
        </motion.div>

        {/* Category filter pills */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex flex-wrap items-center justify-center gap-2 md:gap-3 mb-10"
        >
          {CATEGORIES.map((c) => {
            const isActive = active === c.key;
            const count = c.key === "all" ? MODELS.length : counts[c.key];
            return (
              <button
                key={c.key}
                onClick={() => setActive(c.key)}
                className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 border ${
                  isActive
                    ? "bg-primary/15 text-primary border-primary/60 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.6)]"
                    : "bg-card/40 text-muted-foreground border-border/40 hover:border-primary/30 hover:text-foreground"
                }`}
              >
                <c.icon className="h-4 w-4" />
                {t(`landing.aiArsenal.categories.${c.key}`)}
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-primary/20 text-primary" : "bg-foreground/5 text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </motion.div>

        {/* Bento grid */}
        <LayoutGroup>
          <motion.div
            layout
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 auto-rows-[180px] md:auto-rows-[200px]"
          >
            <AnimatePresence mode="popLayout">
              {filtered.map((model, idx) => (
                <ModelTile key={model.key} model={model} index={idx} />
              ))}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>

        {/* Counter strip */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm"
        >
          <CounterPill icon={Film} value={counts.video} label={t("landing.aiArsenal.categories.video")} />
          <span className="text-border">·</span>
          <CounterPill icon={ImageIcon} value={counts.image} label={t("landing.aiArsenal.categories.image")} />
          <span className="text-border">·</span>
          <CounterPill icon={Volume2} value={counts.audio} label={t("landing.aiArsenal.categories.audio")} />
          <span className="text-border">·</span>
          <CounterPill icon={UserSquare2} value={counts.avatar} label={t("landing.aiArsenal.categories.avatar")} />
          <span className="ml-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-primary/15 to-gold-dark/10 border border-primary/40 text-primary font-semibold">
            <Sparkles className="h-4 w-4" />
            {MODELS.length} {t("landing.aiArsenal.totalLabel")}
          </span>
        </motion.div>
      </div>
    </section>
  );
};

const CounterPill = ({ icon: Icon, value, label }: { icon: typeof Sparkles; value: number; label: string }) => (
  <span className="inline-flex items-center gap-2 text-muted-foreground">
    <Icon className="h-4 w-4 text-primary/70" />
    <span className="font-bold text-foreground">{value}</span> {label}
  </span>
);

const ModelTile = ({ model, index }: { model: Model; index: number }) => {
  const { t } = useTranslation();
  const colSpan = model.hero ? "col-span-2" : "col-span-1";
  const rowSpan = model.hero ? "row-span-2" : "row-span-1";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.4) }}
      className={`group relative ${colSpan} ${rowSpan}`}
    >
      <div
        className={`relative h-full w-full overflow-hidden rounded-2xl border transition-all duration-500 hover:-translate-y-1 ${
          model.recommended
            ? "border-primary/60 shadow-[0_0_25px_-5px_hsl(var(--primary)/0.4)]"
            : "border-border/40 hover:border-primary/40 hover:shadow-[0_0_25px_-10px_hsl(var(--primary)/0.5)]"
        }`}
      >
        {/* Cover image (hero tiles) */}
        {model.cover ? (
          <>
            <img
              src={model.cover}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition-all duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-card/80 via-card/60 to-background backdrop-blur-xl" />
        )}

        {/* Gold accent line top */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        {/* Recommended badge */}
        {model.recommended && (
          <div className="absolute top-3 right-3 z-10">
            <div className="flex items-center gap-1 bg-gradient-to-r from-primary to-gold-dark text-primary-foreground text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shadow-lg">
              <Star className="h-2.5 w-2.5 fill-current" />
              {t("landing.aiArsenal.recommended")}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col justify-end p-4 md:p-5">
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${
                model.recommended
                  ? "bg-gradient-to-br from-primary/40 to-gold-dark/20 border border-primary/40"
                  : "bg-gradient-to-br from-primary/20 to-accent/10 border border-border/40"
              }`}
            >
              <model.icon className={`h-4.5 w-4.5 ${model.recommended ? "text-primary" : "text-foreground/85"}`} />
            </div>
            <h3 className={`font-display font-bold text-foreground leading-tight ${model.hero ? "text-lg md:text-xl" : "text-sm md:text-base"}`}>
              {t(`landing.aiArsenal.models.${model.key}.name`)}
            </h3>
          </div>

          <p className={`text-muted-foreground leading-snug mb-3 ${model.hero ? "text-sm" : "text-[11px] md:text-xs"}`}>
            {t(`landing.aiArsenal.models.${model.key}.tagline`)}
          </p>

          {/* Capability chips */}
          <div className="flex flex-wrap gap-1">
            {model.capabilities.slice(0, model.hero ? 4 : 3).map((cap) => (
              <span
                key={cap}
                className="text-[9px] md:text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-foreground/5 text-muted-foreground border border-border/40 group-hover:border-primary/30 group-hover:text-foreground/80 transition-colors"
              >
                {t(`landing.aiArsenal.caps.${cap}`)}
              </span>
            ))}
          </div>
        </div>

        {/* Hover glow */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-t from-primary/10 via-transparent to-transparent" />
      </div>
    </motion.div>
  );
};
