import { motion } from "framer-motion";
import { Sparkles, Zap } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface CoachHeroHeaderProps {
  isPro: boolean;
}

export const CoachHeroHeader = ({ isPro }: CoachHeroHeaderProps) => {
  const { t } = useTranslation();

  return (
    <div className="relative mb-8">
      {/* Background Glow Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-20 -left-20 w-64 h-64 rounded-full bg-primary/20 blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-10 right-0 w-48 h-48 rounded-full bg-cyan-500/20 blur-3xl"
        />
      </div>

      <div className="relative z-10">
        {/* Mission Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full 
                     bg-muted/30 border border-white/10 backdrop-blur-sm mb-4"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-sm font-medium text-foreground/80">KI-Content-Coach</span>
          {isPro ? (
            <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-semibold border border-primary/30">
              PRO
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground text-xs font-medium">
              FREE
            </span>
          )}
        </motion.div>

        {/* Headline with Gradient */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl md:text-5xl font-bold mb-3"
        >
          <span className="bg-gradient-to-r from-primary via-amber-400 to-cyan-400 bg-clip-text text-transparent">
            {t("coach_title")}
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg text-muted-foreground max-w-2xl"
        >
          {t("coach_subtitle")}
        </motion.p>

        {/* Feature Badges */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap gap-3 mt-4"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/20 border border-white/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">KI-Strategien</span>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/20 border border-white/10">
            <Zap className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-xs text-muted-foreground">Echtzeit-Feedback</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
