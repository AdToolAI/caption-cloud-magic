import { motion } from "framer-motion";
import { Image, Zap, Layers, Sparkles, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";

function FloatingParticles() {
  const particles = useMemo(() => 
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 3,
      duration: 4 + Math.random() * 6,
      delay: Math.random() * 4,
    })), []
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary/40"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.7, 0.2],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function BackgroundReplacerHeroHeader() {
  return (
    <div className="relative mb-8 overflow-hidden rounded-2xl p-1">
      {/* Shimmer border */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-primary/30 via-cyan-400/40 to-primary/30"
          animate={{ backgroundPosition: ['0% 50%', '200% 50%'] }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          style={{ backgroundSize: '200% 100%' }}
        />
      </div>

      <div className="relative bg-card/95 backdrop-blur-xl rounded-[14px] p-6 md:p-8">
        {/* Glow Orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[14px]">
          <motion.div
            className="absolute -top-20 -left-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -top-10 right-20 w-48 h-48 bg-cyan-500/15 rounded-full blur-3xl"
            animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />
        </div>

        <FloatingParticles />

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
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
                  </span>
                  Smart Background v3
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
                  Smart Background
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-lg text-muted-foreground mb-4"
              >
                KI-Produkterkennung · Pro Compositing · Nano Banana 2
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
                  <Cpu className="h-4 w-4 text-cyan-400" />
                  <span className="text-sm font-medium">KI-Analyse</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md bg-card/40 border border-white/10">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-medium">Pro Compositing</span>
                </div>
              </motion.div>
            </div>

            {/* v3 Badge with Pulsating Glow */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="hidden md:block"
            >
              <div className="relative group">
                <motion.div
                  className="absolute -inset-1.5 bg-gradient-to-r from-primary via-cyan-400 to-primary rounded-xl blur-md"
                  animate={{ opacity: [0.4, 0.7, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
                <Badge 
                  variant="default" 
                  className="relative gap-2 text-base px-5 py-2.5 bg-gradient-to-r from-primary to-cyan-500 border-0 shadow-lg overflow-hidden"
                >
                  {/* Shimmer Effect */}
                  <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  <Zap className="h-5 w-5" />
                  v3
                </Badge>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
