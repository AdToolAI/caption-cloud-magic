import { motion } from "framer-motion";
import { Send, Sparkles } from "lucide-react";

interface ComposerHeroHeaderProps {
  selectedChannelCount: number;
}

export function ComposerHeroHeader({ selectedChannelCount }: ComposerHeroHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card/80 via-card/60 to-card/40 backdrop-blur-xl border border-white/10 p-8 mb-6">
      {/* Animated Background Glow Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/20 blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute -bottom-20 -left-20 w-48 h-48 rounded-full bg-cyan-500/20 blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-3">
          {/* Mission Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm"
          >
            <motion.div
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-xs font-medium text-primary tracking-wide uppercase">
              Multi-Channel Composer
            </span>
          </motion.div>

          {/* Gradient Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary via-primary/80 to-cyan-400 bg-clip-text text-transparent"
          >
            Content veröffentlichen
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-muted-foreground max-w-md"
          >
            Erstellen und veröffentlichen Sie Inhalte auf mehreren Plattformen gleichzeitig
          </motion.p>
        </div>

        {/* Channel Counter */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-4"
        >
          <div className="flex flex-col items-center p-4 rounded-xl bg-muted/30 backdrop-blur-sm border border-white/10">
            <div className="flex items-center gap-2 mb-1">
              <Send className="w-4 h-4 text-primary" />
              <motion.span
                key={selectedChannelCount}
                initial={{ scale: 1.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-2xl font-bold text-primary"
              >
                {selectedChannelCount}
              </motion.span>
            </div>
            <span className="text-xs text-muted-foreground">Channels ausgewählt</span>
          </div>

          <motion.div
            className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20 border border-primary/30"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            <Sparkles className="w-6 h-6 text-primary" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
