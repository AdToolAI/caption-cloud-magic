import { motion } from "framer-motion";
import { TrendingUp, Bookmark, Sparkles, Loader2, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";

interface TrendRadarHeroHeaderProps {
  viewMode: 'discover' | 'saved';
  onViewModeChange: (mode: 'discover' | 'saved') => void;
  bookmarkedCount: number;
  onRefresh: () => void;
  loading: boolean;
  trendsCount: number;
}

export function TrendRadarHeroHeader({
  viewMode,
  onViewModeChange,
  bookmarkedCount,
  onRefresh,
  loading,
  trendsCount
}: TrendRadarHeroHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="relative mb-12 overflow-hidden">
      {/* Background Glow Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-20 -right-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-20 -left-20 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.4, 0.2, 0.4],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        {/* Left Side - Title & Subtitle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-4"
        >
          {/* Mission Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/20 via-purple-500/20 to-pink-500/20 border border-primary/30 backdrop-blur-sm"
          >
            <motion.div
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-sm font-medium text-primary">KI-Trendradar</span>
            <Radar className="w-4 h-4 text-primary" />
          </motion.div>

          {/* Main Headline */}
          <h1 className="text-4xl md:text-5xl font-bold">
            <span className="bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent">
              {t('trends.title')}
            </span>
          </h1>

          {/* Subtitle with Trends Count */}
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground text-lg max-w-xl">
              {t('trends.subtitle')}
            </p>
            {trendsCount > 0 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-sm font-medium"
              >
                {trendsCount} Trends
              </motion.span>
            )}
          </div>
        </motion.div>

        {/* Right Side - Action Buttons */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-wrap gap-3"
        >
          {/* Discover Button */}
          <Button
            onClick={() => onViewModeChange('discover')}
            className={`gap-2 relative overflow-hidden transition-all duration-300 ${
              viewMode === 'discover'
                ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-[0_0_20px_hsla(43,90%,68%,0.3)]'
                : 'bg-card/60 backdrop-blur-sm border border-white/10 text-foreground hover:bg-card/80 hover:border-primary/50'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            {t('trends.discover')}
            {viewMode === 'discover' && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              />
            )}
          </Button>

          {/* Saved Button */}
          <Button
            onClick={() => onViewModeChange('saved')}
            className={`gap-2 relative overflow-hidden transition-all duration-300 ${
              viewMode === 'saved'
                ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-[0_0_20px_hsla(43,90%,68%,0.3)]'
                : 'bg-card/60 backdrop-blur-sm border border-white/10 text-foreground hover:bg-card/80 hover:border-primary/50'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${viewMode === 'saved' ? 'fill-current' : ''}`} />
            {t('trends.saved')}
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              viewMode === 'saved' 
                ? 'bg-white/20' 
                : 'bg-primary/20 text-primary'
            }`}>
              {bookmarkedCount}
            </span>
          </Button>

          {/* Refresh Button */}
          <Button
            onClick={onRefresh}
            disabled={loading}
            className="gap-2 relative overflow-hidden bg-card/60 backdrop-blur-sm border border-white/10 text-foreground hover:bg-card/80 hover:border-cyan-500/50 hover:shadow-[0_0_20px_hsla(187,80%,50%,0.2)] transition-all duration-300"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Neu laden
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 4 }}
            />
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
