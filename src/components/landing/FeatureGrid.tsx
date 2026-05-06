import { motion } from "framer-motion";
import {
  Calendar, TrendingUp, Palette, MessageSquare, Share2, Target, ArrowUpRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";

/* ---------- Inline visual mockups (one per feature) ---------- */

const PlanningMock = () => (
  <div className="absolute inset-0 p-6 flex flex-col justify-end">
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 21 }).map((_, i) => {
        const filled = [2, 4, 7, 10, 11, 14, 17, 18, 20].includes(i);
        const accent = [4, 11, 18].includes(i);
        return (
          <div
            key={i}
            className={`aspect-square rounded-[2px] border ${
              accent
                ? "bg-primary/40 border-primary/60"
                : filled
                ? "bg-foreground/10 border-foreground/20"
                : "bg-foreground/[0.03] border-border/30"
            }`}
          />
        );
      })}
    </div>
    <div className="mt-3 flex items-center gap-2 text-[9px] uppercase tracking-[0.25em] text-muted-foreground/70">
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      Auto-Schedule · Mo – So
    </div>
  </div>
);

const AnalyticsMock = () => (
  <div className="absolute inset-0 p-6 flex flex-col justify-end gap-3">
    <div className="flex items-end gap-1.5 h-20">
      {[35, 58, 42, 70, 55, 88, 64, 92, 78, 96].map((h, i) => (
        <div key={i} className="flex-1 relative">
          <div
            className="w-full bg-gradient-to-t from-primary/70 to-primary/20 rounded-t-[2px]"
            style={{ height: `${h}%` }}
          />
        </div>
      ))}
    </div>
    <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.25em] text-muted-foreground/70">
      <span>Reach · 7d</span>
      <span className="text-primary font-semibold">+248%</span>
    </div>
  </div>
);

const BrandKitMock = () => {
  const swatches = [
    "hsl(43, 90%, 68%)",
    "hsl(43, 70%, 50%)",
    "hsl(220, 30%, 12%)",
    "hsl(220, 15%, 25%)",
    "hsl(0, 0%, 95%)",
  ];
  return (
    <div className="absolute inset-0 p-6 flex flex-col justify-end gap-3">
      <div className="flex gap-2">
        {swatches.map((c, i) => (
          <div
            key={i}
            className="flex-1 aspect-square rounded-[3px] border border-border/40"
            style={{ background: c, boxShadow: `0 0 16px ${c}33` }}
          />
        ))}
      </div>
      <div className="flex items-baseline gap-3">
        <span className="font-display text-2xl text-primary leading-none">Aa</span>
        <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground/70">
          Playfair · Inter
        </span>
      </div>
    </div>
  );
};

const CoachMock = () => (
  <div className="absolute inset-0 p-6 flex flex-col justify-end gap-2">
    <div className="self-start max-w-[80%] bg-foreground/5 border border-border/40 rounded-lg rounded-bl-sm px-3 py-2 text-[10px] text-muted-foreground/80">
      Wie performt mein Reel?
    </div>
    <div className="self-end max-w-[85%] bg-primary/15 border border-primary/40 rounded-lg rounded-br-sm px-3 py-2 text-[10px] text-foreground">
      Hook in Sek. 0–2 stärken. <span className="text-primary font-semibold">+34% Watch-Time</span>.
    </div>
  </div>
);

const MultiPlatformMock = () => {
  const platforms = ["IG", "TT", "LI", "X", "YT", "FB"];
  return (
    <div className="absolute inset-0 p-6 flex flex-col justify-end gap-3">
      <div className="grid grid-cols-3 gap-2">
        {platforms.map((p, i) => (
          <div
            key={p}
            className="aspect-[4/3] flex items-center justify-center bg-foreground/5 border border-border/40 rounded-[3px] text-[10px] font-semibold tracking-widest"
            style={{
              boxShadow: i === 0 ? "inset 0 0 0 1px hsla(43, 90%, 68%, 0.4)" : undefined,
              color: i === 0 ? "hsl(43, 90%, 68%)" : "hsl(var(--muted-foreground) / 0.8)",
            }}
          >
            {p}
          </div>
        ))}
      </div>
      <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground/70">
        1 Post · 6 Plattformen · auto-formatiert
      </div>
    </div>
  );
};

const GoalsMock = () => (
  <div className="absolute inset-0 p-6 flex flex-col justify-end gap-3">
    <div className="relative h-1.5 bg-foreground/5 rounded-full overflow-hidden border border-border/30">
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-gold-dark rounded-full"
        style={{ width: "72%", boxShadow: "0 0 12px hsla(43, 90%, 68%, 0.5)" }}
      />
    </div>
    <div className="flex items-baseline justify-between">
      <span className="font-display text-2xl text-foreground tabular-nums leading-none">
        72<span className="text-primary">%</span>
      </span>
      <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground/70">
        Quartalsziel Q2
      </span>
    </div>
  </div>
);

/* ---------- Component ---------- */

export const FeatureGrid = () => {
  const { t } = useTranslation();

  const features = [
    {
      icon: Calendar,
      title: t("landing.featureGrid.contentPlanning"),
      description: t("landing.featureGrid.contentPlanningDesc"),
      link: "/calendar",
      Visual: PlanningMock,
      span: "lg:col-span-2 lg:row-span-2",
      tall: true,
    },
    {
      icon: TrendingUp,
      title: t("landing.featureGrid.analyticsDashboard"),
      description: t("landing.featureGrid.analyticsDashboardDesc"),
      link: "/analytics",
      Visual: AnalyticsMock,
    },
    {
      icon: Palette,
      title: t("landing.featureGrid.brandKit"),
      description: t("landing.featureGrid.brandKitDesc"),
      link: "/brand-kit",
      Visual: BrandKitMock,
    },
    {
      icon: MessageSquare,
      title: t("landing.featureGrid.aiContentCoach"),
      description: t("landing.featureGrid.aiContentCoachDesc"),
      link: "/coach",
      Visual: CoachMock,
    },
    {
      icon: Share2,
      title: t("landing.featureGrid.multiPlatform"),
      description: t("landing.featureGrid.multiPlatformDesc"),
      link: "/composer",
      Visual: MultiPlatformMock,
    },
    {
      icon: Target,
      title: t("landing.featureGrid.goalTracking"),
      description: t("landing.featureGrid.goalTrackingDesc"),
      link: "/goals",
      Visual: GoalsMock,
    },
  ] as const;

  return (
    <section className="relative py-32 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,hsla(43,90%,68%,0.06),transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/20 to-transparent pointer-events-none" />

      <div className="container relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mb-20"
        >
          <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-primary font-semibold mb-6 px-3 py-1 border border-primary/30 bg-card/40 backdrop-blur-sm">
            <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
            Modules
          </span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] mb-6">
            <span className="text-foreground">{t("landing.featureGrid.title1")}</span>
            <span className="bg-gradient-to-r from-primary via-gold to-gold-dark bg-clip-text text-transparent">
              {t("landing.featureGrid.title2")}
            </span>
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed">
            {t("landing.featureGrid.subtitle")}
          </p>
        </motion.div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[260px] gap-5 md:gap-6">
          {features.map((feature, idx) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
              className={`group ${"span" in feature ? feature.span : ""}`}
            >
              <Link to={feature.link} className="block h-full">
                <article
                  className="relative h-full min-h-[260px] overflow-hidden bg-gradient-to-br from-card/70 via-card/50 to-card/20 backdrop-blur-xl border border-border/50 transition-all duration-500 hover:border-primary/50"
                  style={{
                    borderRadius: "6px",
                    boxShadow:
                      "0 1px 0 hsla(43, 90%, 68%, 0.08) inset, 0 30px 60px -30px rgba(0,0,0,0.6)",
                  }}
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  {/* Visual mockup zone */}
                  <div
                    className={`absolute inset-x-0 top-0 overflow-hidden ${
                      "tall" in feature && feature.tall ? "h-1/2" : "h-[55%]"
                    }`}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,hsla(43,90%,68%,0.10),transparent_60%)]" />
                    <feature.Visual />
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-card/80" />
                  </div>

                  {/* Content */}
                  <div
                    className={`absolute inset-x-0 bottom-0 p-6 md:p-7 ${
                      "tall" in feature && feature.tall ? "pt-8" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div
                        className="w-10 h-10 flex items-center justify-center bg-primary/10 border border-primary/30 transition-all duration-300 group-hover:bg-primary/20 group-hover:border-primary/50"
                        style={{ borderRadius: "3px" }}
                      >
                        <feature.icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 -translate-x-1 translate-y-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:text-primary transition-all duration-300" />
                    </div>
                    <h3
                      className={`font-display font-semibold text-foreground mb-2 leading-tight ${
                        "tall" in feature && feature.tall ? "text-2xl md:text-3xl" : "text-lg md:text-xl"
                      }`}
                    >
                      {feature.title}
                    </h3>
                    <p
                      className={`text-muted-foreground leading-relaxed ${
                        "tall" in feature && feature.tall
                          ? "text-sm md:text-base max-w-md"
                          : "text-xs md:text-sm"
                      }`}
                    >
                      {feature.description}
                    </p>
                  </div>

                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{
                      boxShadow:
                        "inset 0 0 60px -20px hsla(43, 90%, 68%, 0.18), 0 30px 80px -20px hsla(43, 90%, 68%, 0.18)",
                    }}
                  />
                </article>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
