import { motion } from "framer-motion";
import { Bookmark, Sparkles, Loader2, Radar } from "lucide-react";
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
    <div className="relative mb-8">
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Left Side - Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-2"
        >
          {/* Mission Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-primary/20 via-purple-500/20 to-pink-500/20 border border-primary/30 backdrop-blur-sm"
          >
            <motion.div
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-sm font-medium text-primary">{t('trends.aiTrendRadar')}</span>
            <Radar className="w-4 h-4 text-primary" />
          </motion.div>

          {/* Main Headline */}
          <h1 className="text-3xl md:text-4xl font-display font-bold">
            <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
              {t('trends.title')}
            </span>
          </h1>

          {/* Subtitle with Trends Count */}
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground text-base max-w-xl">
              {t('trends.subtitle')}
            </p>
            {trendsCount > 0 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-xs font-medium"
              >
                {trendsCount} Trends
              </motion.span>
            )}
          </div>
        </motion.div>

        {/* Right Side - Saved + Reload only */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex gap-3"
        >
          {/* Saved Button */}
          <Button
            onClick={() => onViewModeChange(viewMode === 'saved' ? 'discover' : 'saved')}
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
            {t('trends.reload')}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
