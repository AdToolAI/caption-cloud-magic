import { motion } from 'framer-motion';
import { Sparkles, Wand2 } from 'lucide-react';

export function TemplateGeneratorHeroHeader() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="relative mb-10"
    >
      {/* Background Glow */}
      <div className="absolute -inset-4 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 rounded-3xl blur-3xl -z-10" />
      
      {/* Floating Orbs */}
      <motion.div
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{ duration: 4, repeat: Infinity }}
        className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl"
      />
      <motion.div
        animate={{ 
          scale: [1, 1.3, 1],
          opacity: [0.2, 0.4, 0.2]
        }}
        transition={{ duration: 5, repeat: Infinity, delay: 1 }}
        className="absolute -bottom-10 -left-10 w-40 h-40 bg-accent/10 rounded-full blur-3xl"
      />

      {/* Mission Badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full 
                   backdrop-blur-xl bg-card/60 border border-primary/30
                   shadow-[0_0_20px_hsla(43,90%,68%,0.15)]"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <Wand2 className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-primary uppercase tracking-wider">
          KI-Template-Analyse
        </span>
      </motion.div>

      {/* Gradient Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent"
      >
        Template Generator
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-muted-foreground text-lg max-w-xl"
      >
        Erstelle wiederverwendbare Templates aus erfolgreichen Posts mit KI-Analyse
      </motion.p>

      {/* Feature Highlights */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex flex-wrap gap-3 mt-6"
      >
        {[
          { icon: Sparkles, label: 'KI-Analyse' },
          { icon: Wand2, label: 'Auto-Extraktion' },
        ].map((item, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full 
                       bg-muted/30 border border-white/10 text-sm text-muted-foreground"
          >
            <item.icon className="h-3.5 w-3.5 text-primary" />
            {item.label}
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
