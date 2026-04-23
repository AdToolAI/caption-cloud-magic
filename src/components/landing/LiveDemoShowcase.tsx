import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface DemoCase {
  id: string;
  industryKey: string;
  metricKey: string;
  before: { captionKey: string };
  after: { captionKey: string };
}

const cases: DemoCase[] = [
  {
    id: "restaurant",
    industryKey: "landing.liveDemo.cases.restaurant.industry",
    metricKey: "landing.liveDemo.cases.restaurant.metric",
    before: { captionKey: "landing.liveDemo.cases.restaurant.before" },
    after: { captionKey: "landing.liveDemo.cases.restaurant.after" },
  },
  {
    id: "fitness",
    industryKey: "landing.liveDemo.cases.fitness.industry",
    metricKey: "landing.liveDemo.cases.fitness.metric",
    before: { captionKey: "landing.liveDemo.cases.fitness.before" },
    after: { captionKey: "landing.liveDemo.cases.fitness.after" },
  },
  {
    id: "fashion",
    industryKey: "landing.liveDemo.cases.fashion.industry",
    metricKey: "landing.liveDemo.cases.fashion.metric",
    before: { captionKey: "landing.liveDemo.cases.fashion.before" },
    after: { captionKey: "landing.liveDemo.cases.fashion.after" },
  },
];

export const LiveDemoShowcase = () => {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const c = cases[active];

  const next = () => setActive((p) => (p + 1) % cases.length);
  const prev = () => setActive((p) => (p - 1 + cases.length) % cases.length);

  return (
    <section className="relative py-24 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsla(43,90%,68%,0.06),transparent_60%)] pointer-events-none" />

      <div className="container max-w-7xl mx-auto relative">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-primary font-semibold mb-4 px-3 py-1 border border-primary/30 bg-card/40 backdrop-blur-sm">
            <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
            {t("landing.liveDemo.badge")}
          </span>
          <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold mb-4">
            <span className="bg-gradient-to-r from-primary via-gold to-gold-dark bg-clip-text text-transparent">
              {t("landing.liveDemo.title")}
            </span>
          </h2>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("landing.liveDemo.subtitle")}
          </p>
        </motion.div>

        {/* Industry tabs */}
        <div className="flex items-center justify-center gap-2 md:gap-3 mb-10 flex-wrap">
          {cases.map((cs, i) => (
            <button
              key={cs.id}
              onClick={() => setActive(i)}
              className={`px-4 py-2 text-xs uppercase tracking-[0.18em] font-semibold transition-all duration-300 border ${
                active === i
                  ? "bg-primary/15 border-primary/60 text-primary"
                  : "bg-card/30 border-border/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
              style={{ borderRadius: "3px" }}
            >
              {t(cs.industryKey)}
            </button>
          ))}
        </div>

        {/* Comparison */}
        <AnimatePresence mode="wait">
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="grid lg:grid-cols-[1fr_auto_1fr] gap-6 lg:gap-4 items-stretch"
          >
            {/* BEFORE card */}
            <div className="relative bg-card/40 backdrop-blur-sm border border-border/40 p-6 md:p-8" style={{ borderRadius: "4px" }}>
              <div className="absolute top-3 left-3 text-[9px] uppercase tracking-[0.25em] text-muted-foreground/70 font-bold">
                {t("landing.liveDemo.before")}
              </div>
              <div className="pt-6">
                <div className="aspect-square w-full bg-gradient-to-br from-muted/30 to-muted/10 mb-4 flex items-center justify-center border border-border/30">
                  <span className="text-xs text-muted-foreground/50 uppercase tracking-widest">
                    {t("landing.liveDemo.basicPost")}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground/80 leading-relaxed italic">
                  "{t(c.before.captionKey)}"
                </p>
                <div className="mt-4 pt-4 border-t border-border/30 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-semibold">
                  <span>♡ 24</span>
                  <span>💬 3</span>
                  <span>↗ 1</span>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="hidden lg:flex items-center justify-center px-4">
              <div className="relative flex flex-col items-center gap-2">
                <div className="w-px h-16 bg-gradient-to-b from-transparent via-primary/40 to-transparent" />
                <div className="relative w-12 h-12 flex items-center justify-center bg-card/60 backdrop-blur-sm border border-primary/40" style={{ borderRadius: "3px", boxShadow: "0 0 24px hsla(43, 90%, 68%, 0.25)" }}>
                  <ArrowRight className="h-5 w-5 text-primary" />
                </div>
                <div className="w-px h-16 bg-gradient-to-b from-primary/40 via-transparent to-transparent" />
              </div>
            </div>

            {/* AFTER card */}
            <div
              className="relative bg-gradient-to-br from-card/60 to-card/30 backdrop-blur-md border border-primary/40 p-6 md:p-8"
              style={{
                borderRadius: "4px",
                boxShadow: "0 12px 40px -12px hsla(43, 90%, 68%, 0.25), inset 0 1px 0 hsla(43, 90%, 68%, 0.1)",
              }}
            >
              <div className="absolute top-3 left-3 text-[9px] uppercase tracking-[0.25em] text-primary font-bold">
                {t("landing.liveDemo.after")}
              </div>
              <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 bg-primary/15 border border-primary/40 text-[10px] font-bold text-primary tabular-nums">
                <TrendingUp className="h-3 w-3" />
                {t(c.metricKey)}
              </div>
              <div className="pt-6">
                <div className="aspect-square w-full bg-gradient-to-br from-primary/20 via-gold/10 to-gold-dark/15 mb-4 flex items-center justify-center border border-primary/30 relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsla(43,90%,68%,0.3),transparent_60%)]" />
                  <span className="text-xs text-primary/80 uppercase tracking-widest font-semibold relative z-10">
                    {t("landing.liveDemo.adtoolPost")}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-relaxed font-medium">
                  {t(c.after.captionKey)}
                </p>
                <div className="mt-4 pt-4 border-t border-primary/20 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-primary font-semibold">
                  <span>♡ 12.4K</span>
                  <span>💬 487</span>
                  <span>↗ 1.2K</span>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Mobile nav */}
        <div className="flex lg:hidden items-center justify-center gap-4 mt-8">
          <button onClick={prev} className="p-2 border border-border/40 hover:border-primary/40 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {active + 1} / {cases.length}
          </span>
          <button onClick={next} className="p-2 border border-border/40 hover:border-primary/40 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
};
