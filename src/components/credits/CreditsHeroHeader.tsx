import { motion } from "framer-motion";
import { Coins, ShoppingCart, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CreditsHeroHeaderProps {
  planName: string;
  creditsAvailable: number;
  onBuyCredits: () => void;
}

export const CreditsHeroHeader = ({ planName, creditsAvailable, onBuyCredits }: CreditsHeroHeaderProps) => {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-background via-card/80 to-background border border-white/10 p-8 mb-8">
      {/* Floating Glow Orbs */}
      <motion.div
        className="absolute top-10 right-20 w-32 h-32 bg-primary/20 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-5 left-20 w-24 h-24 bg-cyan-500/20 rounded-full blur-3xl"
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-4">
          {/* Mission Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-sm font-medium text-primary">Credit-Management</span>
          </motion.div>

          {/* Gradient Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-amber-400 to-cyan-400 bg-clip-text text-transparent"
          >
            Ihr Credit-Guthaben
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-muted-foreground max-w-lg"
          >
            Verwalten Sie Ihr Credit-Guthaben und sehen Sie Ihre Transaktionen
          </motion.p>

          {/* Stats Badges */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap gap-3 pt-2"
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card/60 backdrop-blur-sm border border-white/10">
              <Coins className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{creditsAvailable.toLocaleString()} Credits</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card/60 backdrop-blur-sm border border-white/10">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-medium">{planName}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card/60 backdrop-blur-sm border border-white/10">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <span className="text-sm font-medium">Transaktions-Historie</span>
            </div>
          </motion.div>
        </div>

        {/* Premium Buy Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Button
            onClick={onBuyCredits}
            size="lg"
            className="relative overflow-hidden bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 text-primary-foreground shadow-lg hover:shadow-[0_0_30px_hsla(43,90%,68%,0.3)] transition-all duration-300 group"
          >
            {/* Shimmer Effect */}
            <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <ShoppingCart className="mr-2 h-5 w-5" />
            Credits kaufen
          </Button>
        </motion.div>
      </div>
    </div>
  );
};
