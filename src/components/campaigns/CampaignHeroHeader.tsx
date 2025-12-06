import { motion } from "framer-motion";
import { Sparkles, Target, Zap } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

export const CampaignHeroHeader = () => {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="relative mb-10"
    >
      {/* Subtle Background Glow */}
      <div className="absolute -inset-4 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 rounded-3xl blur-3xl -z-10" />
      
      {/* Mission Control Badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full 
                   backdrop-blur-xl bg-card/60 border border-primary/30
                   shadow-[0_0_20px_hsla(43,90%,68%,0.15)]"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <span className="text-xs font-medium text-primary uppercase tracking-wider">
          Mission Control
        </span>
        <Target className="h-3 w-3 text-primary" />
      </motion.div>

      {/* Main Title with Gold Gradient */}
      <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
        {t("campaign_title")}
      </h1>
      
      {/* Subtitle */}
      <p className="text-lg text-muted-foreground max-w-2xl">
        {t("campaign_subtitle")}
      </p>

      {/* Feature Pills */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="flex flex-wrap gap-3 mt-6"
      >
        {[
          { icon: Sparkles, label: "KI-Generiert" },
          { icon: Target, label: "Multi-Plattform" },
          { icon: Zap, label: "Auto-Schedule" },
        ].map((feature, idx) => (
          <div
            key={idx}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
                       backdrop-blur-md bg-card/40 border border-white/10
                       text-sm text-muted-foreground hover:text-foreground
                       hover:border-primary/30 transition-all duration-300"
          >
            <feature.icon className="h-3.5 w-3.5 text-accent" />
            {feature.label}
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
};
