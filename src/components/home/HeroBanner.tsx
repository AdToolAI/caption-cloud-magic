import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Calendar, TrendingUp, Link2, ArrowRight, Shield, Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

export function HeroBanner() {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl shadow-soft bg-gradient-to-br from-background/70 via-background/80 to-background/70 dark:from-background/30 dark:via-background/40 dark:to-background/30 backdrop-blur-xl border border-border/50"
    >
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      
      <div className="relative p-6 md:p-8 lg:p-10">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          {/* Left: Copy + CTAs */}
          <div className="space-y-6">
            <div className="space-y-3">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                {t("heroBanner.heading")}
              </h1>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl">
                {t("heroBanner.subheading")}
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild size="lg" className="rounded-xl shadow-soft hover:shadow-glow transition-all group">
                <Link to="/calendar">
                  <Calendar className="h-5 w-5 mr-2" />
                  {t("heroBanner.ctaPrimary")}
                  <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-xl">
                <Link to="/calendar">
                  {t("heroBanner.ctaSecondary")}
                </Link>
              </Button>
            </div>

            {/* Quick Stats Pills */}
            <div className="flex flex-wrap gap-3 pt-2">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-medium">{t("heroBanner.stats.engagement")}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 text-success border border-success/20">
                <Check className="h-4 w-4" />
                <span className="text-sm font-medium">{t("heroBanner.stats.posts")}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent border border-accent/20">
                <Link2 className="h-4 w-4" />
                <span className="text-sm font-medium">{t("heroBanner.stats.accounts")}</span>
              </div>
            </div>
          </div>

          {/* Right: Trust Section */}
          <div className="space-y-6">
            {/* Trust Badge */}
            <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border/50">
              <Shield className="h-6 w-6 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t("heroBanner.trust.title")}</p>
                <p className="text-xs text-muted-foreground">{t("heroBanner.trust.subtitle")}</p>
              </div>
            </div>

            {/* Trust Logos Row */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("heroBanner.trust.integrations")}
              </p>
              <div className="flex flex-wrap items-center gap-4 opacity-70">
                {/* Instagram */}
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 grid place-items-center text-white font-bold text-xs">
                  IG
                </div>
                {/* TikTok */}
                <div className="h-8 w-8 rounded-lg bg-black dark:bg-white grid place-items-center">
                  <span className="text-white dark:text-black font-bold text-xs">TT</span>
                </div>
                {/* LinkedIn */}
                <div className="h-8 w-8 rounded-lg bg-blue-600 grid place-items-center text-white font-bold text-xs">
                  in
                </div>
                {/* X (Twitter) */}
                <div className="h-8 w-8 rounded-lg bg-black dark:bg-white grid place-items-center">
                  <span className="text-white dark:text-black font-bold text-xs">𝕏</span>
                </div>
                {/* YouTube */}
                <div className="h-8 w-8 rounded-lg bg-red-600 grid place-items-center text-white font-bold text-xs">
                  YT
                </div>
                {/* Facebook */}
                <div className="h-8 w-8 rounded-lg bg-blue-500 grid place-items-center text-white font-bold text-xs">
                  FB
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
