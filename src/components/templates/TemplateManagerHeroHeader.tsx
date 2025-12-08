import { motion } from "framer-motion";
import { Calendar, Sparkles, FolderOpen } from "lucide-react";

interface TemplateManagerHeroHeaderProps {
  templateCount: number;
}

export const TemplateManagerHeroHeader = ({ templateCount }: TemplateManagerHeroHeaderProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="relative mb-10"
    >
      {/* Background Glow Orbs */}
      <div className="absolute -inset-4 -z-10">
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      {/* Mission Badge */}
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
          Kampagnen-Vorlagen
        </span>
        <FolderOpen className="h-3 w-3 text-primary" />
      </motion.div>

      {/* Main Title with Gradient */}
      <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-primary via-primary to-cyan-400 bg-clip-text text-transparent">
        Campaign Templates
      </h1>

      {/* Subtitle */}
      <p className="text-lg text-muted-foreground max-w-2xl">
        Erstelle wiederverwendbare Kampagnen-Vorlagen für deine Social-Media-Strategien
      </p>

      {/* Stats Pills */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="flex flex-wrap gap-3 mt-6"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
                       backdrop-blur-md bg-card/40 border border-white/10
                       text-sm text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 text-primary" />
          {templateCount} Templates
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
                       backdrop-blur-md bg-card/40 border border-white/10
                       text-sm text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          Wiederverwendbar
        </div>
      </motion.div>
    </motion.div>
  );
};
