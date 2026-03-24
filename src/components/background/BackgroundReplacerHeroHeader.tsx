import { motion } from "framer-motion";
import { Image, Zap, Layers, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function BackgroundReplacerHeroHeader() {
  return (
    <div className="relative mb-8 overflow-hidden">
      {/* Background Glow Orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute -top-20 -left-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl"
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
          className="absolute -top-10 right-20 w-48 h-48 bg-cyan-500/15 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
        />
      </div>

      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div>
            {/* Mission Badge */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Badge 
                variant="outline" 
                className="mb-4 gap-2 px-3 py-1.5 backdrop-blur-md bg-card/40 border-white/10"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Smart Background
              </Badge>
            </motion.div>

            {/* Gradient Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl md:text-5xl font-bold mb-3"
            >
              <span className="bg-gradient-to-r from-primary via-amber-400 to-cyan-400 bg-clip-text text-transparent">
                Professionelle Produktbilder
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg text-muted-foreground mb-4"
            >
              Pro Compositing mit Szenen-Diversität & Multi-Varianten
            </motion.p>

            {/* Stats Badges */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-wrap items-center gap-3"
            >
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md bg-card/40 border border-white/10">
                <Layers className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">7 Kategorien</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md bg-card/40 border border-white/10">
                <Image className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-medium">Pro Compositing</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md bg-card/40 border border-white/10">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-medium">Edge-Refinement</span>
              </div>
            </motion.div>
          </div>

          {/* Pro v2 Badge with Shimmer */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="hidden md:block"
          >
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary via-cyan-400 to-primary rounded-xl blur-md opacity-40 group-hover:opacity-60 transition-opacity" />
              <Badge 
                variant="default" 
                className="relative gap-2 text-base px-5 py-2.5 bg-gradient-to-r from-primary to-amber-500 border-0 shadow-lg overflow-hidden"
              >
                {/* Shimmer Effect */}
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <Zap className="h-5 w-5" />
                Pro v2
              </Badge>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
