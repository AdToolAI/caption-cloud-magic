import { motion } from "framer-motion";
import { Paintbrush, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BrandKitHeroHeaderProps {
  brandKitCount: number;
  onCreateNew: () => void;
}

export function BrandKitHeroHeader({ brandKitCount, onCreateNew }: BrandKitHeroHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl mb-8">
      {/* Background Glow Orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute top-0 right-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-0 left-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.4, 0.6, 0.4],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 px-8 py-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left Side */}
          <div className="space-y-4">
            {/* Mission Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-xl bg-card/60 border border-white/10"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-sm font-medium text-primary">KI-Markenidentität</span>
            </motion.div>

            {/* Gradient Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl lg:text-5xl font-bold"
            >
              <span className="bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
                Automatisches Marken-Set
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg text-muted-foreground max-w-xl"
            >
              KI-gestützte Markenidentität für alle deine Inhalte
            </motion.p>

            {/* Stats Badges */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-wrap gap-3"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-xl bg-primary/10 border border-primary/20">
                <Paintbrush className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {brandKitCount} {brandKitCount === 1 ? "Set" : "Sets"} erstellt
                </span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-xl bg-accent/10 border border-accent/20">
                <Sparkles className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium">Multi-Brand-Management</span>
              </div>
            </motion.div>
          </div>

          {/* Right Side - Action Button */}
          {brandKitCount > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Button
                onClick={onCreateNew}
                size="lg"
                className="relative group overflow-hidden bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-primary-foreground shadow-[0_0_20px_hsla(43,90%,68%,0.3)] hover:shadow-[0_0_30px_hsla(43,90%,68%,0.5)] transition-all duration-300"
              >
                {/* Shimmer Effect */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>
                
                <Sparkles className="mr-2 h-5 w-5 group-hover:rotate-12 transition-transform" />
                Neues Set erstellen
              </Button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
