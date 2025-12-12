import { motion } from 'framer-motion';
import { Headphones, Sparkles, Zap } from 'lucide-react';

export function AudioStudioHeroHeader() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center mb-8"
    >
      {/* Mission Badge */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/10 to-cyan-500/10 border border-primary/20 backdrop-blur-sm mb-6"
      >
        <motion.div
          animate={{ 
            boxShadow: ['0 0 0 0 rgba(var(--primary), 0)', '0 0 0 8px rgba(var(--primary), 0)'],
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-2 h-2 rounded-full bg-primary"
        />
        <Headphones className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent">
          Audio Master Pro
        </span>
        <Sparkles className="w-4 h-4 text-cyan-500" />
      </motion.div>

      {/* Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4"
      >
        <span className="bg-gradient-to-r from-primary via-cyan-500 to-primary bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
          Professioneller Sound.
        </span>
        <br />
        <span className="text-foreground">Ein Klick.</span>
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6"
      >
        KI-gestützte Audiobearbeitung wie bei den Profis. 
        Rauschentfernung, Transcript-Editing, Beat-Sync und mehr.
      </motion.p>

      {/* Feature Pills */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex flex-wrap justify-center gap-3"
      >
        {[
          { label: 'Studio Sound', icon: Zap },
          { label: 'Transcript Editing', icon: Sparkles },
          { label: 'Beat-Sync', icon: Headphones }
        ].map((pill, i) => (
          <motion.div
            key={pill.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 + i * 0.1 }}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border/50 backdrop-blur-sm"
          >
            <pill.icon className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">{pill.label}</span>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
