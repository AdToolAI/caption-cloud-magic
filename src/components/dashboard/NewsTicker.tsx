import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Instagram, Music, Linkedin, Youtube, Twitter, Facebook } from "lucide-react";

interface Trend {
  id: string;
  platform: string;
  name: string;
  popularity_index: number;
  category: string;
}

const PLATFORM_STYLES: Record<string, { gradient: string; icon: any; dot: string }> = {
  tiktok: { gradient: "from-cyan-400 to-cyan-600", icon: Music, dot: "bg-cyan-400 shadow-[0_0_6px_theme(colors.cyan.400)]" },
  instagram: { gradient: "from-pink-500 via-rose-500 to-orange-400", icon: Instagram, dot: "bg-pink-500 shadow-[0_0_6px_theme(colors.pink.500)]" },
  youtube: { gradient: "from-red-500 to-red-700", icon: Youtube, dot: "bg-red-500 shadow-[0_0_6px_theme(colors.red.500)]" },
  linkedin: { gradient: "from-blue-500 to-blue-700", icon: Linkedin, dot: "bg-blue-500 shadow-[0_0_6px_theme(colors.blue.500)]" },
  x: { gradient: "from-slate-300 to-slate-500", icon: Twitter, dot: "bg-slate-400 shadow-[0_0_6px_theme(colors.slate.400)]" },
  facebook: { gradient: "from-blue-600 to-indigo-600", icon: Facebook, dot: "bg-blue-600 shadow-[0_0_6px_theme(colors.blue.600)]" },
};

const FALLBACK_TIPS = [
  "📊 Post Reels between 6-8 PM for 3x more reach",
  "🎯 Use 3-5 hashtags per post for optimal visibility",
  "🔥 Carousel posts have 1.4x more engagement",
  "⏰ Best LinkedIn time: Tuesday & Wednesday 8-10 AM",
];

const TrendCard = ({ trend, onClick }: { trend: Trend; onClick: () => void }) => {
  const style = PLATFORM_STYLES[trend.platform?.toLowerCase()] || PLATFORM_STYLES.tiktok;
  const Icon = style.icon;
  const popularity = Math.min(trend.popularity_index || 50, 100);

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 flex items-center gap-1.5 px-2 py-0.5 group/card cursor-pointer"
    >
      {/* Holographic Thumbnail */}
      <div className={`relative w-5 h-5 rounded-sm bg-gradient-to-br ${style.gradient} flex items-center justify-center shadow-[0_0_8px_hsl(var(--primary)/0.3)] ring-1 ring-primary/30`}>
        <Icon className="w-2.5 h-2.5 text-white/90" />
        <div className="absolute inset-0 rounded-sm bg-gradient-to-tr from-white/20 to-transparent" />
      </div>

      {/* Trend Name */}
      <span className="text-[10px] font-medium text-primary/90 max-w-[100px] truncate tracking-wide group-hover/card:text-primary transition-colors">
        {trend.name}
      </span>

      {/* Platform Dot */}
      <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />

      {/* Popularity micro-bar */}
      <div className="w-6 h-1 rounded-full bg-primary/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
          style={{ width: `${popularity}%` }}
        />
      </div>
    </button>
  );
};

export const NewsTicker = () => {
  const navigate = useNavigate();
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(() => {
    const stored = localStorage.getItem("newsticker-visible");
    return stored !== "false";
  });

  const fetchTrends = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-trends', {
        body: { language: 'en' }
      });
      if (error) throw error;
      setTrends(data?.trends?.slice(0, 20) || []);
    } catch (e) {
      console.error('Ticker: failed to fetch trends', e);
      setTrends([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
    const interval = setInterval(fetchTrends, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem("newsticker-visible", String(isVisible));
  }, [isVisible]);

  const hasTrends = trends.length > 0;

  const renderScrollContent = () => {
    if (hasTrends) {
      return trends.map((trend, i) => (
        <div key={`${trend.id}-${i}`} className="flex items-center">
          <TrendCard trend={trend} onClick={() => navigate('/trend-radar')} />
          {i < trends.length - 1 && (
            <div className="w-px h-3 bg-gradient-to-b from-transparent via-primary/40 to-transparent mx-1" />
          )}
        </div>
      ));
    }
    return FALLBACK_TIPS.map((tip, i) => (
      <span key={i} className="flex-shrink-0 text-[10px] text-primary/80 font-medium px-3">
        {tip}
      </span>
    ));
  };

  return (
    <AnimatePresence mode="wait">
      {isVisible ? (
        <motion.div
          key="ticker"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="relative overflow-hidden bg-gradient-to-r from-[hsl(220,50%,3%)] via-[hsl(var(--background))]/80 to-[hsl(220,50%,3%)] backdrop-blur-md group"
        >
          {/* Top glow line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_12px_hsl(var(--primary)/0.4)]" />
          {/* Bottom glow line */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_12px_hsl(var(--primary)/0.4)]" />

          {/* Scan-line effect */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-0 bottom-0 w-24 bg-gradient-to-r from-transparent via-primary/[0.06] to-transparent animate-[scanline_4s_linear_infinite]" />
          </div>

          <div className="flex items-center h-6">
            {/* Label badge */}
            <div className="relative z-10 flex-shrink-0 flex items-center gap-1 px-3 h-full bg-gradient-to-r from-[hsl(220,50%,3%)] to-transparent border-r border-primary/20">
              <span className="relative inline-flex items-center gap-1 px-2 py-px rounded text-[8px] font-display font-bold tracking-[0.2em] uppercase text-primary border border-primary/40 shadow-[0_0_14px_hsl(var(--primary)/0.35)]">
                {/* Radar pulse */}
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                </span>
                TREND RADAR
              </span>
            </div>

            {/* Scrolling trend cards */}
            <div className="overflow-hidden flex-1 h-full flex items-center">
              <div className="flex whitespace-nowrap animate-[marquee_120s_linear_infinite] group-hover:[animation-play-state:paused]">
                <div className="flex items-center">
                  {renderScrollContent()}
                </div>
                <div className="flex items-center">
                  {renderScrollContent()}
                </div>
              </div>
            </div>

            {/* Toggle switch */}
            <div className="relative z-10 flex-shrink-0 flex items-center gap-1 px-3 h-full bg-gradient-to-l from-[hsl(220,50%,3%)] to-transparent border-l border-primary/20">
              <Switch
                checked={isVisible}
                onCheckedChange={setIsVisible}
                className="data-[state=checked]:bg-primary/80 data-[state=unchecked]:bg-muted h-4 w-7"
              />
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="ticker-collapsed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex justify-end px-4 py-0.5"
        >
          <button
            onClick={() => setIsVisible(true)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-display font-bold tracking-[0.15em] uppercase text-primary/60 border border-primary/20 hover:border-primary/40 hover:text-primary transition-all duration-300 hover:shadow-[0_0_10px_hsl(var(--primary)/0.2)]"
          >
            ◆ TRENDS
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
