import { motion } from "framer-motion";
import { Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AnalyticsHeroHeaderProps {
  lastUpdated: Date;
  platform: string;
  setPlatform: (platform: string) => void;
  timeFilter: "7" | "30";
  setTimeFilter: (filter: "7" | "30") => void;
  onRefresh: () => void;
  loading: boolean;
}

export const AnalyticsHeroHeader = ({
  lastUpdated,
  platform,
  setPlatform,
  timeFilter,
  setTimeFilter,
  onRefresh,
  loading
}: AnalyticsHeroHeaderProps) => {
  return (
    <div className="relative overflow-hidden rounded-2xl mb-8">
      {/* Background with floating orbs */}
      <div className="absolute inset-0 bg-gradient-to-br from-card/80 via-card/60 to-card/40 backdrop-blur-xl" />
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-20 -right-20 w-60 h-60 bg-primary/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-20 -left-20 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl"
        />
      </div>

      <div className="relative z-10 p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left side - Title and badge */}
          <div className="space-y-4">
            {/* Mission Badge */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full 
                         bg-primary/10 border border-primary/30 backdrop-blur-sm
                         shadow-[0_0_15px_hsla(43,90%,68%,0.15)]"
            >
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsla(43,90%,68%,0.8)]"
              />
              <span className="text-sm font-medium text-primary">Echtzeit-Analytics</span>
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-primary/80 to-cyan-400 
                         bg-clip-text text-transparent"
            >
              Analytics Dashboard
            </motion.h1>

            {/* Subtitle with live update */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-3"
            >
              <span className="text-muted-foreground">Control Room • Letzte Aktualisierung:</span>
              <motion.div
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full 
                           bg-green-500/10 border border-green-500/30"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-green-400">{lastUpdated.toLocaleTimeString()}</span>
              </motion.div>
            </motion.div>
          </div>

          {/* Right side - Controls */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-3 flex-wrap"
          >
            {/* Platform Select */}
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-40 h-11 bg-muted/20 border-white/10 
                                         focus:border-primary/60 focus:ring-2 focus:ring-primary/20
                                         rounded-xl backdrop-blur-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="backdrop-blur-xl bg-card/90 border-white/10">
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="x">X</SelectItem>
              </SelectContent>
            </Select>

            {/* Time Filter Select */}
            <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as "7" | "30")}>
              <SelectTrigger className="w-32 h-11 bg-muted/20 border-white/10 
                                         focus:border-primary/60 focus:ring-2 focus:ring-primary/20
                                         rounded-xl backdrop-blur-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="backdrop-blur-xl bg-card/90 border-white/10">
                <SelectItem value="7">7 Tage</SelectItem>
                <SelectItem value="30">30 Tage</SelectItem>
              </SelectContent>
            </Select>

            {/* Refresh Button */}
            <Button 
              onClick={onRefresh}
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl bg-muted/20 border-white/10 
                         hover:bg-primary/20 hover:border-primary/40 hover:text-primary
                         hover:shadow-[0_0_20px_hsla(43,90%,68%,0.2)]
                         transition-all duration-300"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
