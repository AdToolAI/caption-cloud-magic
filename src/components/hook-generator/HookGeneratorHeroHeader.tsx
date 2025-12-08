import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface HookGeneratorHeroHeaderProps {
  usageCount: number;
  maxUsage: number;
  isPro: boolean;
  isBasic: boolean;
}

export const HookGeneratorHeroHeader = ({ 
  usageCount, 
  maxUsage, 
  isPro,
  isBasic 
}: HookGeneratorHeroHeaderProps) => {
  const { t } = useTranslation();

  return (
    <div className="relative text-center space-y-6 py-8">
      {/* Background Glow Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] 
                     bg-gradient-to-r from-primary/20 via-purple-500/20 to-primary/20 
                     rounded-full blur-3xl"
        />
      </div>

      {/* Mission Badge */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex justify-center"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full 
                        bg-primary/10 border border-primary/30 backdrop-blur-sm
                        shadow-[0_0_20px_hsla(43,90%,68%,0.15)]">
          <motion.span
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsla(43,90%,68%,0.8)]"
          />
          <span className="text-sm font-medium text-primary">KI-Hook-Optimierung</span>
        </div>
      </motion.div>

      {/* Gradient Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="text-4xl md:text-5xl font-bold font-heading"
      >
        <span className="bg-gradient-to-r from-primary via-amber-400 to-purple-500 bg-clip-text text-transparent">
          {t("hooks.title")}
        </span>
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="text-muted-foreground text-lg max-w-2xl mx-auto"
      >
        {t("hooks.subtitle")}
      </motion.p>

      {/* Usage Counter Badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex justify-center"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl 
                        bg-muted/30 border border-white/10 backdrop-blur-sm">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            {isPro ? (
              <span className="text-primary">Unlimited Generations</span>
            ) : isBasic ? (
              <>
                <span className="text-primary">{usageCount}</span>
                <span className="text-muted-foreground">/{maxUsage} heute verwendet</span>
              </>
            ) : (
              <>
                <span className="text-primary">{usageCount}</span>
                <span className="text-muted-foreground">/{maxUsage} heute verwendet</span>
              </>
            )}
          </span>
        </div>
      </motion.div>
    </div>
  );
};
