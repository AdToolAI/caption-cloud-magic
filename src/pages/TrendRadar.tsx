import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useAICall } from "@/hooks/useAICall";
import { FEATURE_COSTS } from "@/lib/featureCosts";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Sparkles, Bookmark, BookmarkCheck, Loader2, Search, Tag, Lightbulb, Target, Zap, ExternalLink, ChevronLeft, ChevronRight, BarChart3, Globe, Flame, Users } from "lucide-react";
import { TrendDetailModal } from "@/components/trends/TrendDetailModal";
import { TrendRadarHeroHeader } from "@/components/trends/TrendRadarHeroHeader";
import CountUp from "@/components/ui/count-up";

interface Trend {
  id: string;
  platform: string;
  trend_type: string;
  name: string;
  description: string;
  popularity_index: number;
  language: string;
  category: string;
  region: string;
  data_json: any;
}

interface TrendIdeas {
  trend_name: string;
  summary: string;
  ideas: Array<{
    title: string;
    hook: string;
    caption_outline: string;
  }>;
  suggested_hashtags: string[];
  recommended_platforms: string[];
}

// --- Mini Sparkline SVG ---
function Sparkline({ value, color }: { value: number; color: string }) {
  // Generate a fake sparkline path based on the popularity value
  const points = Array.from({ length: 12 }, (_, i) => {
    const base = value * 0.6;
    const variance = Math.sin(i * 1.2 + value * 0.1) * 15 + Math.cos(i * 0.7) * 10;
    const trend = (i / 11) * (value - base);
    return Math.max(5, Math.min(95, base + variance + trend));
  });
  
  const height = 32;
  const width = 80;
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - (p / 100) * height;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="opacity-70">
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <motion.path
        d={path}
        fill="none"
        stroke={`url(#spark-${color})`}
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />
    </svg>
  );
}

// --- Marquee Ticker ---
function TrendTicker({ trends }: { trends: Trend[] }) {
  if (trends.length === 0) return null;
  const doubled = [...trends, ...trends]; // duplicate for seamless loop
  
  return (
    <div className="relative overflow-hidden py-3 mb-8">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-background to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background to-transparent z-10" />
      
      <motion.div
        className="flex gap-8 whitespace-nowrap"
        animate={{ x: [0, -50 * trends.length] }}
        transition={{ duration: trends.length * 3, repeat: Infinity, ease: "linear" }}
      >
        {doubled.map((trend, i) => (
          <div key={`${trend.id}-${i}`} className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
              {trend.platform}
            </span>
            <span className="text-sm font-semibold bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent">
              {trend.name}
            </span>
            <span className="text-primary/40">•</span>
            <span className={`text-xs font-bold ${trend.popularity_index > 85 ? 'text-red-400' : 'text-muted-foreground/50'}`}>
              🔥 {trend.popularity_index}
            </span>
            <span className="text-border/30 mx-2">|</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

// --- Floating Stats Section ---
function FloatingStats({ trends }: { trends: Trend[] }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  
  const platforms = new Set(trends.map(t => t.platform));
  const hotTrends = trends.filter(t => t.popularity_index > 80).length;
  
  const stats = [
    { label: "Trends analysiert", value: trends.length, icon: BarChart3, color: "from-primary/20 to-amber-500/20", textColor: "text-primary" },
    { label: "Plattformen", value: platforms.size || 5, icon: Globe, color: "from-cyan-500/20 to-blue-500/20", textColor: "text-cyan-400" },
    { label: "Hot Trends", value: hotTrends || 12, icon: Flame, color: "from-red-500/20 to-orange-500/20", textColor: "text-red-400" },
    { label: "Kategorien", value: 6, icon: Users, color: "from-purple-500/20 to-pink-500/20", textColor: "text-purple-400" },
  ];

  return (
    <div ref={ref} className="mb-12">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.15, duration: 0.5 }}
          >
            <Card className="backdrop-blur-xl bg-card/30 border-white/10 hover:border-primary/30 transition-all duration-300 overflow-hidden relative group">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
              <CardContent className="p-5 flex flex-col items-center text-center relative z-10">
                <stat.icon className={`w-6 h-6 mb-2 ${stat.textColor}`} />
                <div className={`text-3xl font-bold ${stat.textColor}`}>
                  {isInView ? (
                    <CountUp end={stat.value} duration={2} />
                  ) : (
                    0
                  )}
                </div>
                <span className="text-xs text-muted-foreground mt-1">{stat.label}</span>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// --- Hero Carousel ---
function HeroCarousel({ trends, onAnalyze }: { trends: Trend[]; onAnalyze: (t: Trend) => void }) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent(prev => (prev + 1) % trends.length);
    }, 6000);
  }, [trends.length]);

  useEffect(() => {
    if (trends.length === 0) return;
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [trends.length, resetTimer]);

  if (trends.length === 0) return null;

  const trend = trends[current];
  const gradient = getPlatformGradientStatic(trend.platform);
  const facts = [
    trend.platform && `📱 ${trend.platform.charAt(0).toUpperCase() + trend.platform.slice(1)}`,
    trend.category && `🏷️ ${trend.category}`,
    trend.popularity_index && `🔥 Popularität: ${trend.popularity_index}/100`,
  ].filter(Boolean);

  return (
    <div className="mb-12 relative">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <motion.div 
            className="p-3 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-xl border border-orange-500/20"
            animate={{ boxShadow: ['0 0 20px hsla(30, 80%, 50%, 0.2)', '0 0 40px hsla(30, 80%, 50%, 0.4)', '0 0 20px hsla(30, 80%, 50%, 0.2)'] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Zap className="w-6 h-6 text-orange-500" />
          </motion.div>
          <div>
            <h2 className="text-2xl font-bold">Top-Trends der Woche</h2>
            <p className="text-sm text-muted-foreground">Die heißesten Trends im Überblick</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            className="border-white/10 hover:border-primary/50 h-8 w-8"
            onClick={() => { setCurrent(p => (p - 1 + trends.length) % trends.length); resetTimer(); }}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="border-white/10 hover:border-primary/50 h-8 w-8"
            onClick={() => { setCurrent(p => (p + 1) % trends.length); resetTimer(); }}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl min-h-[280px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={trend.id + current}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.5 }}
            className={`relative w-full bg-gradient-to-br ${gradient} rounded-2xl overflow-hidden`}
          >
            {/* Scanline overlay */}
            <div className="absolute inset-0 opacity-[0.06]" style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.4) 2px, rgba(0,0,0,0.4) 4px)',
            }} />
            {/* Moving gradient overlay */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            />
            {/* Dark overlay for readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
            
            <div className="relative z-10 p-8 md:p-12 flex flex-col justify-end min-h-[280px]">
              {/* Rank badge */}
              <motion.div
                className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/20"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
              >
                <span className="text-white font-bold text-lg">#{current + 1}</span>
                <span className="text-white/60 text-sm">von {trends.length}</span>
              </motion.div>

              {/* Trending NOW badge for hot ones */}
              {trend.popularity_index > 85 && (
                <motion.div
                  className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 bg-red-500/30 backdrop-blur-md rounded-full border border-red-400/40"
                  animate={{ scale: [1, 1.05, 1], boxShadow: ['0 0 15px hsla(0,80%,50%,0.3)', '0 0 30px hsla(0,80%,50%,0.5)', '0 0 15px hsla(0,80%,50%,0.3)'] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Flame className="w-4 h-4 text-red-400" />
                  <span className="text-red-300 font-bold text-xs uppercase tracking-wider">Trending Now</span>
                </motion.div>
              )}

              {/* Typewriter title */}
              <motion.h3
                className="text-3xl md:text-4xl font-bold text-white mb-4 max-w-2xl"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {trend.name}
              </motion.h3>
              
              <motion.p
                className="text-white/70 text-base md:text-lg mb-6 max-w-xl line-clamp-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                {trend.description}
              </motion.p>

              {/* Animated fact chips */}
              <div className="flex flex-wrap gap-3 mb-6">
                {facts.map((fact, i) => (
                  <motion.span
                    key={i}
                    className="px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-white text-sm border border-white/20"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.15 }}
                  >
                    {fact}
                  </motion.span>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
              >
                <Button
                  onClick={() => onAnalyze(trend)}
                  className="relative overflow-hidden bg-white/20 backdrop-blur-sm border border-white/30 text-white hover:bg-white/30 hover:shadow-[0_0_30px_hsla(0,0%,100%,0.2)] transition-all"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Jetzt analysieren
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 2 }}
                  />
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2 mt-4">
        {trends.map((_, i) => (
          <button
            key={i}
            onClick={() => { setCurrent(i); resetTimer(); }}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === current 
                ? 'w-8 bg-primary shadow-[0_0_10px_hsla(43,90%,68%,0.5)]' 
                : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// Static helper (used outside component)
function getPlatformGradientStatic(platform: string) {
  switch (platform) {
    case 'tiktok': return 'from-pink-600 via-purple-600 to-cyan-500';
    case 'instagram': return 'from-purple-600 via-pink-500 to-orange-400';
    case 'youtube': return 'from-red-700 via-red-600 to-red-500';
    case 'linkedin': return 'from-blue-700 via-blue-600 to-blue-500';
    case 'twitter': return 'from-sky-600 via-sky-500 to-blue-400';
    case 'pinterest': return 'from-red-600 via-pink-500 to-rose-400';
    default: return 'from-primary via-purple-500 to-pink-500';
  }
}

function getSparkColor(platform: string) {
  switch (platform) {
    case 'tiktok': return '#ec4899';
    case 'instagram': return '#a855f7';
    case 'youtube': return '#ef4444';
    case 'linkedin': return '#3b82f6';
    case 'twitter': return '#38bdf8';
    default: return '#eab308';
  }
}

export default function TrendRadar() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { executeAICall, loading: aiLoading } = useAICall();

  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [expandedTrend, setExpandedTrend] = useState<string | null>(null);
  const [trendIdeas, setTrendIdeas] = useState<Record<string, TrendIdeas>>({});
  const [bookmarked, setBookmarked] = useState<string[]>([]);
  const [selectedTrend, setSelectedTrend] = useState<Trend | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [modalDefaultTab, setModalDefaultTab] = useState<'overview' | 'analysis' | 'articles' | 'media'>('overview');
  
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'discover' | 'saved'>('discover');
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());

  useEffect(() => { fetchTrends(); }, [platformFilter, categoryFilter]);
  useEffect(() => {
    if (user) { fetchBookmarks(); } else { setBookmarked([]); }
  }, [user]);

  const fetchTrends = async () => {
    setLoading(true);
    try {
      const body: any = { language: 'en' };
      if (platformFilter !== 'all') body.platform = platformFilter;
      if (categoryFilter !== 'all') body.category = categoryFilter;
      const { data, error } = await supabase.functions.invoke('fetch-trends', { body });
      if (error) throw error;
      setTrends(data.trends || []);
    } catch (error) {
      console.error('Error fetching trends:', error);
      toast({ title: "Error loading trends", description: error instanceof Error ? error.message : 'Unknown error', variant: "destructive" });
    } finally { setLoading(false); }
  };

  const fetchBookmarks = async () => {
    if (!user) { setBookmarked([]); return; }
    try {
      const { data, error } = await supabase.from('trend_bookmarks').select('trend_id').eq('user_id', user.id);
      if (error) throw error;
      setBookmarked(data?.map(b => b.trend_id) || []);
    } catch (error) {
      console.error('[Bookmarks] Error fetching:', error);
      setBookmarked([]);
    }
  };

  const openTrendDetail = (trend: Trend, tab: 'overview' | 'analysis' | 'articles' | 'media' = 'overview') => {
    setSelectedTrend(trend); setModalDefaultTab(tab); setDetailModalOpen(true);
  };

  const analyzeTrend = async (trend: Trend, openModal: boolean = true) => {
    if (trendIdeas[trend.id]) {
      if (openModal) { setSelectedTrend(trend); setModalDefaultTab('analysis'); setDetailModalOpen(true); }
      return;
    }
    if (!user) {
      toast({ title: "Authentication required", description: "Please log in to analyze trends", variant: "destructive" });
      navigate('/auth'); return;
    }
    if (openModal) { setSelectedTrend(trend); setModalDefaultTab('analysis'); setDetailModalOpen(true); }
    setAnalyzing(trend.id);
    try {
      const data = await executeAICall({
        featureCode: FEATURE_COSTS.TREND_FETCH, estimatedCost: 3,
        apiCall: async () => {
          const { data, error } = await supabase.functions.invoke('analyze-trend', {
            body: { trend_name: trend.name, trend_description: trend.description, platform: trend.platform, language: trend.language, trend_type: trend.trend_type, category: trend.category }
          });
          if (error) throw error;
          return data;
        }
      });
      setTrendIdeas(prev => ({ ...prev, [trend.id]: data }));
      setExpandedTrend(trend.id);
      toast({ title: "Analyse abgeschlossen", description: `${data.content_ideas?.length || data.ideas?.length} Content-Ideen generiert` });
    } catch (error: any) {
      console.error('Error analyzing trend:', error);
      if (error.code !== 'INSUFFICIENT_CREDITS') {
        toast({ title: "Analyse fehlgeschlagen", description: error instanceof Error ? error.message : 'Unknown error', variant: "destructive" });
      }
    } finally { setAnalyzing(null); }
  };

  const toggleBookmark = async (trendId: string) => {
    if (!trendId) { toast({ title: "Fehler", description: "Dieser Trend kann nicht gespeichert werden", variant: "destructive" }); return; }
    const isCurrentlyBookmarked = bookmarked.includes(trendId);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) { navigate('/auth'); return; }
      if (isCurrentlyBookmarked) {
        const { error } = await supabase.from('trend_bookmarks').delete().eq('trend_id', trendId).eq('user_id', currentUser.id);
        if (error) throw error;
        setBookmarked(prev => prev.filter(id => id !== trendId));
        toast({ title: "Bookmark entfernt" });
      } else {
        const { error } = await supabase.from('trend_bookmarks').insert({ trend_id: trendId, user_id: currentUser.id });
        if (error) throw error;
        setBookmarked(prev => [...prev, trendId]);
        toast({ title: "Trend gespeichert" });
      }
    } catch (error) {
      toast({ title: "Fehler", description: error instanceof Error ? error.message : 'Unbekannter Fehler', variant: "destructive" });
    }
  };

  const filteredTrends = trends.filter(trend => {
    const matchesPlatform = platformFilter === 'all' || trend.platform === platformFilter;
    const matchesCategory = categoryFilter === 'all' || trend.category?.toLowerCase().includes(categoryFilter);
    const matchesSearch = searchQuery === '' || trend.name.toLowerCase().includes(searchQuery.toLowerCase()) || trend.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBookmark = viewMode === 'discover' || bookmarked.includes(trend.id);
    return matchesPlatform && matchesCategory && matchesSearch && matchesBookmark;
  });

  const topTrends = [...trends].sort((a, b) => b.popularity_index - a.popularity_index).slice(0, 5);

  const categories = [
    { id: 'social-media', name: t('trends.niches.socialMedia'), icon: '💡', color: 'from-blue-500/20 to-purple-500/20', glowColor: 'hover:shadow-[0_0_30px_hsla(220,80%,60%,0.25)]', animation: 'animate-bounce' },
    { id: 'ecommerce', name: t('trends.niches.ecommerce'), icon: '🛒', color: 'from-green-500/20 to-emerald-500/20', glowColor: 'hover:shadow-[0_0_30px_hsla(140,60%,50%,0.25)]', animation: 'animate-pulse' },
    { id: 'lifestyle', name: t('trends.niches.lifestyle'), icon: '🌟', color: 'from-pink-500/20 to-rose-500/20', glowColor: 'hover:shadow-[0_0_30px_hsla(340,80%,60%,0.25)]', animation: 'animate-spin' },
    { id: 'business', name: t('trends.niches.business'), icon: '🤖', color: 'from-indigo-500/20 to-blue-500/20', glowColor: 'hover:shadow-[0_0_30px_hsla(230,80%,60%,0.25)]', animation: 'animate-pulse' },
    { id: 'motivation', name: t('trends.niches.motivation'), icon: '🚀', color: 'from-orange-500/20 to-red-500/20', glowColor: 'hover:shadow-[0_0_30px_hsla(20,80%,60%,0.25)]', animation: 'animate-bounce' },
    { id: 'finance', name: t('trends.niches.finance'), icon: '💰', color: 'from-yellow-500/20 to-amber-500/20', glowColor: 'hover:shadow-[0_0_30px_hsla(43,90%,68%,0.25)]', animation: 'animate-pulse' },
  ];

  const ecommerceSubcategories = [
    { id: 'tech-gadgets', name: 'Tech-Gadgets & Smart-Tools', icon: '📱' },
    { id: 'haushalt', name: 'Haushalts-Innovationen', icon: '🏠' },
    { id: 'beauty', name: 'Beauty & Skincare', icon: '💄' },
    { id: 'pets', name: 'Haustier-Gadgets', icon: '🐾' },
    { id: 'fitness', name: 'Fitness & Wellness', icon: '💪' },
    { id: 'home-decor', name: 'Home-Decor & Einrichtung', icon: '🛋️' },
    { id: 'mode', name: 'Mode & Accessoires', icon: '👗' },
    { id: 'küche', name: 'Küche & Genuss', icon: '🍳' },
    { id: 'geschenke', name: 'Geschenkideen unter 30 €', icon: '🎁' },
    { id: 'produktivität', name: 'Produktivität & Arbeitsalltag', icon: '💼' },
  ];

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  const toggleFlip = (id: string) => {
    setFlippedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 py-8">
        <div className="container mx-auto px-4 max-w-7xl">
          {/* Hero Section */}
          <TrendRadarHeroHeader
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            bookmarkedCount={bookmarked.length}
            onRefresh={() => { setTrends([]); fetchTrends(); }}
            loading={loading}
            trendsCount={trends.length}
          />

          {/* === LIVE TICKER === */}
          {trends.length > 0 && <TrendTicker trends={trends} />}

          {/* Niche Categories with animated icons */}
          <motion.div className="mb-12" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="flex items-center gap-3 mb-6">
              <motion.div className="p-3 bg-gradient-to-br from-primary/20 to-cyan-500/20 rounded-xl border border-primary/20" whileHover={{ scale: 1.05, rotate: 5 }}>
                <Sparkles className="w-6 h-6 text-primary" />
              </motion.div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">{t('trends.discoverNiche')}</h2>
            </div>

            <motion.div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" variants={containerVariants} initial="hidden" animate="visible">
              {categories.map((cat) => {
                const isActive = categoryFilter === cat.id;
                return (
                  <motion.div key={cat.id} variants={itemVariants} whileHover={{ scale: 1.05, y: -5 }} whileTap={{ scale: 0.98 }}>
                    <Card
                      className={`cursor-pointer transition-all duration-500 backdrop-blur-xl border overflow-hidden relative
                        ${isActive ? 'bg-gradient-to-br ' + cat.color + ' border-primary/50 shadow-[0_0_40px_hsla(43,90%,68%,0.3)]' : 'bg-card/40 border-white/10 hover:border-primary/30 ' + cat.glowColor}`}
                      onClick={() => setCategoryFilter(isActive ? 'all' : cat.id)}
                    >
                      {isActive && (
                        <motion.div className="absolute inset-0 rounded-2xl" animate={{ boxShadow: ['inset 0 0 20px hsla(43,90%,68%,0.1)', 'inset 0 0 30px hsla(43,90%,68%,0.2)', 'inset 0 0 20px hsla(43,90%,68%,0.1)'] }} transition={{ duration: 2, repeat: Infinity }} />
                      )}
                      <CardContent className="p-5 text-center space-y-3 relative z-10">
                        <motion.div
                          className={`text-4xl mx-auto w-14 h-14 flex items-center justify-center rounded-xl ${isActive ? 'bg-primary/20 shadow-[0_0_25px_hsla(43,90%,68%,0.4)]' : 'bg-muted/20'} transition-all duration-300`}
                          animate={isActive ? { scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] } : {}}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          whileHover={{ scale: 1.2, rotate: 15 }}
                        >
                          {cat.icon}
                        </motion.div>
                        <p className={`font-semibold text-sm ${isActive ? 'text-primary' : ''}`}>{cat.name}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>

          {/* E-Commerce Subcategories */}
          {categoryFilter === 'ecommerce' && (
            <motion.div className="mb-12" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><span className="text-2xl">🛒</span>E-Commerce Produkt-Kategorien</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {ecommerceSubcategories.map((sub, index) => (
                  <motion.div key={sub.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.05 }}>
                    <Button variant="outline" className="h-auto py-3 w-full flex flex-col items-center gap-2 backdrop-blur-xl bg-card/60 border-white/10 hover:bg-card/80 hover:border-primary/50 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.15)] transition-all duration-300"
                      onClick={async () => {
                        setLoading(true);
                        try {
                          const { data, error } = await supabase.functions.invoke('fetch-trends', { body: { language: 'en', category: 'ecommerce' } });
                          if (error) throw error;
                          setTrends((data.trends || []).filter((t: any) => t.data_json?.subcategory === sub.id));
                        } catch (error) { toast({ title: "Fehler beim Laden", description: "Trends konnten nicht geladen werden", variant: "destructive" }); }
                        finally { setLoading(false); }
                      }}
                    >
                      <span className="text-2xl">{sub.icon}</span>
                      <span className="text-xs text-center">{sub.name}</span>
                    </Button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* === HERO CAROUSEL (replaces static top-trends grid) === */}
          {viewMode === 'discover' && topTrends.length > 0 && (
            <HeroCarousel trends={topTrends} onAnalyze={(trend) => analyzeTrend(trend)} />
          )}

          {/* === FLOATING STATS === */}
          {viewMode === 'discover' && trends.length > 0 && <FloatingStats trends={trends} />}

          {/* Filters & Search */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="mb-8 backdrop-blur-xl bg-card/30 border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.15)] relative overflow-hidden">
              <div className="absolute inset-0 rounded-2xl opacity-30 pointer-events-none" style={{ background: 'linear-gradient(135deg, hsla(43,90%,68%,0.1), transparent 40%, transparent 60%, hsla(187,80%,50%,0.1))' }} />
              <CardContent className="p-6 space-y-4 relative z-10">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2"><Search className="w-4 h-4 text-primary" />{t('trends.search')}</label>
                    <Input placeholder={t('trends.searchPlaceholder')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-muted/10 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 focus:shadow-[0_0_20px_hsla(43,90%,68%,0.15)] transition-all duration-300" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('trends.platform')}</label>
                    <Select value={platformFilter} onValueChange={setPlatformFilter}>
                      <SelectTrigger className="bg-muted/10 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"><SelectValue /></SelectTrigger>
                      <SelectContent className="backdrop-blur-xl bg-card/95 border-white/10">
                        <SelectItem value="all">{t('trends.allPlatforms')}</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="pinterest">Pinterest</SelectItem>
                        <SelectItem value="twitter">Twitter/X</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('trends.category')}</label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="bg-muted/10 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"><SelectValue /></SelectTrigger>
                      <SelectContent className="backdrop-blur-xl bg-card/95 border-white/10">
                        <SelectItem value="all">{t('trends.allCategories')}</SelectItem>
                        <SelectItem value="social-media">{t('trends.niches.socialMedia')}</SelectItem>
                        <SelectItem value="ecommerce">{t('trends.niches.ecommerce')}</SelectItem>
                        <SelectItem value="lifestyle">{t('trends.niches.lifestyle')}</SelectItem>
                        <SelectItem value="business">{t('trends.niches.business')}</SelectItem>
                        <SelectItem value="motivation">{t('trends.niches.motivation')}</SelectItem>
                        <SelectItem value="finance">{t('trends.niches.finance')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Trends Grid */}
          {loading ? (
            <motion.div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" variants={containerVariants} initial="hidden" animate="visible">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <motion.div key={i} variants={itemVariants}>
                  <Card className="backdrop-blur-xl bg-card/40 border-white/10 overflow-hidden">
                    <div className="h-28 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-muted/60 via-muted/40 to-muted/60 animate-pulse" />
                      <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent" animate={{ x: ['-100%', '200%'] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />
                    </div>
                    <CardContent className="p-5 space-y-3">
                      <div className="h-5 bg-muted/50 rounded-lg animate-pulse w-3/4" />
                      <div className="h-4 bg-muted/50 rounded-lg animate-pulse w-full" />
                      <div className="h-4 bg-muted/50 rounded-lg animate-pulse w-1/2" />
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          ) : filteredTrends.length === 0 ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <Card className="backdrop-blur-xl bg-card/60 border-white/10">
                <CardContent className="py-12 text-center space-y-4">
                  {viewMode === 'saved' ? (
                    <>
                      <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} className="inline-block">
                        <Bookmark className="w-16 h-16 text-muted-foreground/50 mx-auto" />
                      </motion.div>
                      <p className="text-muted-foreground text-lg">Du hast noch keine Trends gespeichert</p>
                      <Button onClick={() => setViewMode('discover')} className="bg-gradient-to-r from-primary to-primary/80"><TrendingUp className="w-4 h-4 mr-2" />Trends entdecken</Button>
                    </>
                  ) : (
                    <>
                      <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity }} className="inline-block">
                        <TrendingUp className="w-16 h-16 text-muted-foreground/50 mx-auto" />
                      </motion.div>
                      <p className="text-muted-foreground text-lg">Keine Trends gefunden</p>
                      <Button onClick={fetchTrends} className="bg-gradient-to-r from-primary to-primary/80"><Sparkles className="w-4 h-4 mr-2" />Trends neu laden</Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">
                  {viewMode === 'saved' ? t('trends.saved') : t('trends.allTrends')}
                  <span className="ml-2 text-muted-foreground text-lg">({filteredTrends.length})</span>
                </h2>
              </div>

              <motion.div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" variants={containerVariants} initial="hidden" animate="visible">
                {filteredTrends.map((trend, index) => {
                  const gradient = getPlatformGradientStatic(trend.platform);
                  const isFlipped = flippedCards.has(trend.id);
                  const isHot = trend.popularity_index > 85;

                  return (
                    <motion.div key={trend.id} variants={itemVariants} whileHover={{ y: -8 }} style={{ perspective: 1000 }}>
                      <div
                        className="relative w-full cursor-pointer"
                        style={{ transformStyle: 'preserve-3d', minHeight: '380px' }}
                      >
                        {/* FRONT */}
                        <motion.div
                          animate={{ rotateY: isFlipped ? 180 : 0 }}
                          transition={{ duration: 0.6 }}
                          style={{ backfaceVisibility: 'hidden', position: isFlipped ? 'absolute' : 'relative', inset: 0 }}
                          className="w-full"
                        >
                          <Card
                            className="group relative overflow-hidden backdrop-blur-xl bg-card/40 border-white/10 hover:border-primary/50 hover:shadow-[0_0_35px_hsla(43,90%,68%,0.2)] transition-all duration-500 h-full"
                            onClick={() => analyzeTrend(trend)}
                          >
                            {/* Platform Gradient Header */}
                            <div className={`relative h-20 bg-gradient-to-br ${gradient} overflow-hidden`}>
                              <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.4) 2px, rgba(0,0,0,0.4) 4px)' }} />
                              <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" animate={{ x: ['-100%', '200%'] }} transition={{ duration: 3, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }} />
                              <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/30 backdrop-blur-sm text-white text-xs font-semibold border border-white/20 uppercase tracking-wider">{trend.platform}</div>
                              
                              {/* TRENDING NOW badge */}
                              {isHot && (
                                <motion.div
                                  className="absolute top-3 right-3 flex items-center gap-1 px-3 py-1 rounded-full bg-red-500/30 backdrop-blur-sm border border-red-400/40"
                                  animate={{ scale: [1, 1.08, 1], boxShadow: ['0 0 10px hsla(0,80%,50%,0.2)', '0 0 20px hsla(0,80%,50%,0.4)', '0 0 10px hsla(0,80%,50%,0.2)'] }}
                                  transition={{ duration: 1.5, repeat: Infinity }}
                                >
                                  <Flame className="w-3 h-3 text-red-400" />
                                  <span className="text-[10px] font-bold text-red-300 uppercase tracking-wider">Hot</span>
                                </motion.div>
                              )}
                              
                              {!isHot && trend.data_json?.estimated_virality && (
                                <motion.div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/30 backdrop-blur-sm text-white text-xs font-bold border border-white/20" animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                                  🔥 {trend.data_json.estimated_virality}
                                </motion.div>
                              )}
                              <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded bg-black/20 backdrop-blur-sm text-white/80 text-[10px] font-medium border border-white/10">{trend.trend_type}</div>
                            </div>

                            <CardContent className="p-5 space-y-4">
                              <div className="flex items-start justify-between gap-3">
                                <h3 className="font-bold text-lg group-hover:text-primary transition-colors line-clamp-2 flex-1">{trend.name}</h3>
                                <Button variant={bookmarked.includes(trend.id) ? "default" : "outline"} size="icon"
                                  onClick={(e) => { e.stopPropagation(); toggleBookmark(trend.id); }}
                                  className={`shrink-0 h-8 w-8 transition-all ${bookmarked.includes(trend.id) ? 'bg-primary text-primary-foreground shadow-[0_0_15px_hsla(43,90%,68%,0.4)]' : 'border-white/10 hover:border-primary/50'}`}
                                >
                                  {bookmarked.includes(trend.id) ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                                </Button>
                              </div>

                              <p className="text-sm text-muted-foreground line-clamp-2">{trend.description}</p>

                              {/* Sparkline + Popularity */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <Sparkline value={trend.popularity_index} color={getSparkColor(trend.platform)} />
                                  <span className="text-sm font-bold text-primary">{trend.popularity_index}/100</span>
                                </div>
                                {/* Flip button */}
                                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary"
                                  onClick={(e) => { e.stopPropagation(); toggleFlip(trend.id); }}
                                >
                                  Quick-Facts →
                                </Button>
                              </div>

                              {/* Neon Popularity Bar */}
                              <div className="w-full bg-muted/20 rounded-full h-1.5 overflow-hidden relative">
                                <motion.div className={`bg-gradient-to-r ${gradient} h-1.5 rounded-full relative z-10`} initial={{ width: 0 }} animate={{ width: `${trend.popularity_index}%` }} transition={{ duration: 1, delay: index * 0.05 }} />
                                <motion.div className={`absolute top-0 left-0 h-1.5 rounded-full bg-gradient-to-r ${gradient} blur-sm opacity-50`} initial={{ width: 0 }} animate={{ width: `${trend.popularity_index}%` }} transition={{ duration: 1, delay: index * 0.05 }} />
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                {trend.category && (
                                  <div className="flex items-center gap-1 text-xs px-2 py-1 bg-muted/20 rounded-md border border-white/5"><Tag className="w-3 h-3" /><span>{trend.category}</span></div>
                                )}
                                {trend.data_json?.content_ideas && (
                                  <div className="flex items-center gap-1 text-xs px-2 py-1 bg-primary/10 text-primary rounded-md border border-primary/20"><Lightbulb className="w-3 h-3" /><span>{trend.data_json.content_ideas.length} {t('trends.ideas')}</span></div>
                                )}
                              </div>

                              <div className="pt-3 border-t border-white/5 flex gap-2">
                                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openTrendDetail(trend); }} className="flex-1 border-white/10 hover:border-primary/50 hover:bg-primary/5">
                                  <ExternalLink className="w-4 h-4 mr-2" />Mehr erfahren
                                </Button>
                                <Button onClick={(e) => { e.stopPropagation(); analyzeTrend(trend); }} disabled={analyzing === trend.id} className="flex-1 relative overflow-hidden bg-gradient-to-r from-primary/80 to-primary hover:from-primary hover:to-primary/90 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.3)] transition-all" size="sm">
                                  {analyzing === trend.id ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('trends.analyzing')}</>) : (<><Sparkles className="w-4 h-4 mr-2" />Analysieren</>)}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>

                        {/* BACK (Quick Facts) */}
                        <motion.div
                          animate={{ rotateY: isFlipped ? 0 : -180 }}
                          transition={{ duration: 0.6 }}
                          style={{ backfaceVisibility: 'hidden', position: isFlipped ? 'relative' : 'absolute', inset: 0 }}
                          className="w-full"
                        >
                          <Card className="h-full backdrop-blur-xl bg-card/60 border-primary/30 shadow-[0_0_30px_hsla(43,90%,68%,0.15)] overflow-hidden">
                            <div className={`h-3 bg-gradient-to-r ${gradient}`} />
                            <CardContent className="p-6 space-y-4">
                              <div className="flex items-center justify-between">
                                <h3 className="font-bold text-lg text-primary">Quick Facts</h3>
                                <Button variant="ghost" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); toggleFlip(trend.id); }}>← Zurück</Button>
                              </div>
                              
                              <div className="space-y-3">
                                <div className="p-3 bg-muted/10 rounded-lg border border-white/5">
                                  <span className="text-xs text-muted-foreground">Plattform</span>
                                  <p className="font-semibold capitalize">{trend.platform}</p>
                                </div>
                                <div className="p-3 bg-muted/10 rounded-lg border border-white/5">
                                  <span className="text-xs text-muted-foreground">Kategorie</span>
                                  <p className="font-semibold">{trend.category || 'Allgemein'}</p>
                                </div>
                                <div className="p-3 bg-muted/10 rounded-lg border border-white/5">
                                  <span className="text-xs text-muted-foreground">Typ</span>
                                  <p className="font-semibold">{trend.trend_type}</p>
                                </div>
                                <div className="p-3 bg-muted/10 rounded-lg border border-white/5">
                                  <span className="text-xs text-muted-foreground">Popularität</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-primary text-xl">{trend.popularity_index}</span>
                                    <span className="text-muted-foreground text-sm">/ 100</span>
                                  </div>
                                </div>
                                {trend.data_json?.audience_fit && (
                                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Target className="w-3 h-3" /> Zielgruppe</span>
                                    <p className="text-sm mt-1">{trend.data_json.audience_fit}</p>
                                  </div>
                                )}
                              </div>

                              <Button onClick={() => analyzeTrend(trend)} className="w-full bg-gradient-to-r from-primary/80 to-primary" size="sm">
                                <Sparkles className="w-4 h-4 mr-2" />Vollständige Analyse
                              </Button>
                            </CardContent>
                          </Card>
                        </motion.div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </>
          )}
        </div>
      </main>

      <TrendDetailModal
        trend={selectedTrend}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        isBookmarked={selectedTrend ? bookmarked.includes(selectedTrend.id) : false}
        onToggleBookmark={toggleBookmark}
        analysisData={selectedTrend ? trendIdeas[selectedTrend.id] : null}
        onAnalyze={(trend) => analyzeTrend(trend, false)}
        isAnalyzing={selectedTrend ? analyzing === selectedTrend.id : false}
        defaultTab={modalDefaultTab}
      />

      <Footer />
    </div>
  );
}
