import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

const PromptWizardHeroHeader = () => {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative text-center mb-10"
    >
      {/* Background Glow Effects */}
      <div className="absolute -inset-8 bg-gradient-to-r from-primary/10 via-purple-500/10 to-primary/10 rounded-3xl blur-3xl -z-10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/5 rounded-full blur-[100px] -z-10" />

      {/* Mission Badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full 
                   backdrop-blur-xl bg-card/60 border border-primary/30
                   shadow-[0_0_20px_hsla(var(--primary)/0.15)]"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative rounded-full h-2 w-2 bg-primary" />
        </span>
        <span className="text-xs font-medium text-primary uppercase tracking-wider">
          KI-Prompt-Optimierung
        </span>
        <Sparkles className="h-3.5 w-3.5 text-primary" />
      </motion.div>

      {/* Main Headline with Gradient */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 
                   bg-gradient-to-r from-primary via-primary to-purple-400 
                   bg-clip-text text-transparent"
      >
        {t("wizard.title")}
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="text-lg text-muted-foreground max-w-2xl mx-auto"
      >
        {t("wizard.subtitle")}
      </motion.p>

      {/* Decorative Line */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="mt-6 h-px w-32 mx-auto bg-gradient-to-r from-transparent via-primary/50 to-transparent"
      />
    </motion.div>
  );
};

export default PromptWizardHeroHeader;
