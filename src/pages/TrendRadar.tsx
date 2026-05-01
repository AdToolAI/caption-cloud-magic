import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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
import { TrendingUp, Sparkles, Bookmark, BookmarkCheck, Loader2, Search, Tag, Lightbulb, Target, Zap, ExternalLink, ChevronLeft, ChevronRight, Flame, Play } from "lucide-react";
import { TrendDetailModal } from "@/components/trends/TrendDetailModal";
import { TrendRadarHeroHeader } from "@/components/trends/TrendRadarHeroHeader";
import { TrendCardMedia, PopularityRing, HeroMediaBackground } from "@/components/trends/TrendCardMedia";


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




// --- Hero Carousel ---
function HeroCarousel({ trends, onAnalyze, t }: { trends: Trend[]; onAnalyze: (t: Trend) => void; t: (key: string) => string }) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const [progress, setProgress] = useState(0);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(0);
    timerRef.current = setInterval(() => {
      setCurrent(prev => (prev + 1) % trends.length);
      setProgress(0);
    }, 8000);
  }, [trends.length]);

  // Progress bar animation
  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 1.25, 100));
    }, 100);
    return () => clearInterval(progressInterval);
  }, [current]);

  useEffect(() => {
    if (trends.length === 0) return;
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [trends.length, resetTimer]);

  if (trends.length === 0) return null;

  const trend = trends[current];
  const facts = [
    trend.platform && `${trend.platform.charAt(0).toUpperCase() + trend.platform.slice(1)}`,
    trend.category && `${trend.category}`,
    trend.popularity_index && `${t('trends.popularityLabel')}: ${trend.popularity_index}/100`,
  ].filter(Boolean);

  return (
    <div className="mb-12 relative">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <motion.div 
            className="p-3 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl border border-primary/20"
            animate={{ boxShadow: ['0 0 20px hsla(43, 90%, 68%, 0.2)', '0 0 40px hsla(43, 90%, 68%, 0.4)', '0 0 20px hsla(43, 90%, 68%, 0.2)'] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Zap className="w-6 h-6 text-primary" />
          </motion.div>
          <div>
            <h2 className="text-2xl font-display font-bold">{t('trends.topTrends')}</h2>
            <p className="text-sm text-muted-foreground">{t('trends.topTrendsSubtitleAlt')}</p>
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

      <div className="relative overflow-hidden rounded-2xl min-h-[340px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={trend.id + current}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="relative w-full rounded-2xl overflow-hidden"
          >
            {/* Real image background with Ken Burns */}
            <HeroMediaBackground category={trend.category} platform={trend.platform} index={current} imageUrl={trend.data_json?.image_url} />
            
            <div className="relative z-10 p-8 md:p-12 flex flex-col justify-end min-h-[340px]">
              {/* Top bar */}
              <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
                <motion.div
                  className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/20"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <span className="text-white font-bold text-lg">#{current + 1}</span>
                  <span className="text-white/60 text-sm">{t('trends.ofCount')} {trends.length}</span>
                </motion.div>

                <div className="flex items-center gap-3">
                  {trend.data_json?.content_ideas && (
                    <motion.div
                      className="flex items-center gap-2 px-3 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/20"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      <Play className="w-3 h-3 text-white" />
                      <span className="text-white/80 text-xs">{trend.data_json.content_ideas.length} Ideas</span>
                    </motion.div>
                  )}
                  
                  {trend.popularity_index > 85 && (
                    <motion.div
                      className="flex items-center gap-2 px-4 py-2 bg-red-500/30 backdrop-blur-md rounded-full border border-red-400/40"
                      animate={{ scale: [1, 1.05, 1], boxShadow: ['0 0 15px hsla(0,80%,50%,0.3)', '0 0 30px hsla(0,80%,50%,0.5)', '0 0 15px hsla(0,80%,50%,0.3)'] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <Flame className="w-4 h-4 text-red-400" />
                      <span className="text-red-300 font-bold text-xs uppercase tracking-wider">Trending Now</span>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Content */}
              <motion.h3
                className="text-3xl md:text-4xl font-display font-bold text-white mb-4 max-w-2xl"
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
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  <PopularityRing value={trend.popularity_index} size={40} />
                </motion.div>
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
                  {t('trends.analyzeNow')}
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

        {/* Instagram Stories-style progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20 z-20">
          <div className="flex gap-0.5 h-full px-1">
            {trends.map((_, i) => (
              <div key={i} className="flex-1 rounded-full overflow-hidden bg-white/20">
                <motion.div
                  className="h-full bg-primary"
                  style={{ 
                    width: i < current ? '100%' : i === current ? `${progress}%` : '0%',
                    boxShadow: i === current ? '0 0 8px hsla(43,90%,68%,0.6)' : 'none'
                  }}
                />
              </div>
            ))}
          </div>
        </div>
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
  useTrackPageFeature("trend_radar");
  const { t, language } = useTranslation();
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

  useEffect(() => { fetchTrends(); }, [platformFilter, categoryFilter, language]);
  useEffect(() => {
    if (user) { fetchBookmarks(); } else { setBookmarked([]); }
  }, [user]);

  

  const fetchTrends = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const body: any = { language, force: forceRefresh };
      if (platformFilter !== 'all') body.platform = platformFilter;
      if (categoryFilter !== 'all') body.category = categoryFilter;
      const { data, error } = await supabase.functions.invoke('fetch-trends', { body });
      if (error) throw error;
      setTrends(data.trends || []);
    } catch (error) {
      console.error('Error fetching trends:', error);
      toast({ title: t('trends.analysisFailed'), description: error instanceof Error ? error.message : t('trends.unknownError'), variant: "destructive" });
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
      toast({ title: t('trends.analysisComplete'), description: `${data.content_ideas?.length || data.ideas?.length} ${t('trends.ideasGenerated')}` });
    } catch (error: any) {
      console.error('Error analyzing trend:', error);
      if (error.code !== 'INSUFFICIENT_CREDITS') {
        toast({ title: t('trends.analysisFailed'), description: error instanceof Error ? error.message : t('trends.unknownError'), variant: "destructive" });
      }
    } finally { setAnalyzing(null); }
  };

  const toggleBookmark = async (trendId: string) => {
    if (!trendId) { toast({ title: t('trends.error'), description: t('trends.cannotSave'), variant: "destructive" }); return; }
    const isCurrentlyBookmarked = bookmarked.includes(trendId);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) { navigate('/auth'); return; }
      if (isCurrentlyBookmarked) {
        const { error } = await supabase.from('trend_bookmarks').delete().eq('trend_id', trendId).eq('user_id', currentUser.id);
        if (error) throw error;
        setBookmarked(prev => prev.filter(id => id !== trendId));
        toast({ title: t('trends.bookmarkRemoved') });
      } else {
        const { error } = await supabase.from('trend_bookmarks').insert({ trend_id: trendId, user_id: currentUser.id });
        if (error) throw error;
        setBookmarked(prev => [...prev, trendId]);
        toast({ title: t('trends.trendSaved') });
      }
    } catch (error) {
      toast({ title: t('trends.error'), description: error instanceof Error ? error.message : t('trends.unknownError'), variant: "destructive" });
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
    { id: 'social-media', name: t('trends.niches.socialMedia'), image: 'https://images.pexels.com/photos/607812/pexels-photo-607812.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop', color: 'from-blue-500/20 to-purple-500/20' },
    { id: 'ecommerce', name: t('trends.niches.ecommerce'), image: 'https://images.pexels.com/photos/5632399/pexels-photo-5632399.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop', color: 'from-green-500/20 to-emerald-500/20' },
    { id: 'lifestyle', name: t('trends.niches.lifestyle'), image: 'https://images.pexels.com/photos/3771836/pexels-photo-3771836.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop', color: 'from-pink-500/20 to-rose-500/20' },
    { id: 'business', name: t('trends.niches.business'), image: 'https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop', color: 'from-indigo-500/20 to-blue-500/20' },
    { id: 'motivation', name: t('trends.niches.motivation'), image: 'https://images.pexels.com/photos/3756681/pexels-photo-3756681.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop', color: 'from-orange-500/20 to-red-500/20' },
    { id: 'finance', name: t('trends.niches.finance'), image: 'https://images.pexels.com/photos/7567443/pexels-photo-7567443.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop', color: 'from-yellow-500/20 to-amber-500/20' },
  ];

  const ecommerceSubcategories = [
    { id: 'tech-gadgets', name: t('trends.ecommSubTechGadgets'), icon: '📱' },
    { id: 'haushalt', name: t('trends.ecommSubHousehold'), icon: '🏠' },
    { id: 'beauty', name: t('trends.ecommSubBeauty'), icon: '💄' },
    { id: 'pets', name: t('trends.ecommSubPets'), icon: '🐾' },
    { id: 'fitness', name: t('trends.ecommSubFitness'), icon: '💪' },
    { id: 'home-decor', name: t('trends.ecommSubHomeDecor'), icon: '🛋️' },
    { id: 'mode', name: t('trends.ecommSubFashion'), icon: '👗' },
    { id: 'küche', name: t('trends.ecommSubKitchen'), icon: '🍳' },
    { id: 'geschenke', name: t('trends.ecommSubGifts'), icon: '🎁' },
    { id: 'produktivität', name: t('trends.ecommSubProductivity'), icon: '💼' },
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
          <TrendRadarHeroHeader
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            bookmarkedCount={bookmarked.length}
            onRefresh={() => { setTrends([]); fetchTrends(true); }}
            loading={loading}
            trendsCount={trends.length}
          />

          {/* Hero Carousel — Top position */}
          {viewMode === 'discover' && topTrends.length > 0 && (
            <HeroCarousel trends={topTrends} onAnalyze={(trend) => analyzeTrend(trend)} t={t} />
          )}

          

          {/* Category Cards with images */}
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
                      className={`cursor-pointer transition-all duration-500 backdrop-blur-xl border overflow-hidden relative h-32
                        ${isActive ? 'border-primary/50 shadow-[0_0_40px_hsla(43,90%,68%,0.3)]' : 'bg-card/40 border-white/10 hover:border-primary/30 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.15)]'}`}
                      onClick={() => setCategoryFilter(isActive ? 'all' : cat.id)}
                    >
                      {/* Background image */}
                      <img
                        src={cat.image}
                        alt={cat.name}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                      {/* Dark overlay */}
                      <div className={`absolute inset-0 transition-all duration-500 ${
                        isActive 
                          ? 'bg-gradient-to-t from-black/70 via-black/40 to-primary/30' 
                          : 'bg-gradient-to-t from-black/80 via-black/50 to-black/30 hover:from-black/60 hover:via-black/30'
                      }`} />
                      {/* Active glow ring */}
                      {isActive && (
                        <motion.div 
                          className="absolute inset-0 rounded-xl border-2 border-primary/60" 
                          animate={{ boxShadow: ['inset 0 0 15px hsla(43,90%,68%,0.15)', 'inset 0 0 25px hsla(43,90%,68%,0.3)', 'inset 0 0 15px hsla(43,90%,68%,0.15)'] }} 
                          transition={{ duration: 2, repeat: Infinity }} 
                        />
                      )}
                      {/* Text centered */}
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <p className={`font-semibold text-sm text-center px-2 drop-shadow-lg ${isActive ? 'text-primary' : 'text-white'}`}>
                          {cat.name}
                        </p>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>

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
                      <p className="text-muted-foreground text-lg">{t('trends.noSavedTrends')}</p>
                      <Button onClick={() => setViewMode('discover')} className="bg-gradient-to-r from-primary to-primary/80"><TrendingUp className="w-4 h-4 mr-2" />{t('trends.discoverTrends')}</Button>
                    </>
                  ) : (
                    <>
                      <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity }} className="inline-block">
                        <TrendingUp className="w-16 h-16 text-muted-foreground/50 mx-auto" />
                      </motion.div>
                      <p className="text-muted-foreground text-lg">{t('trends.noTrendsFound')}</p>
                      <Button onClick={() => fetchTrends()} className="bg-gradient-to-r from-primary to-primary/80"><Sparkles className="w-4 h-4 mr-2" />{t('trends.reloadTrends')}</Button>
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
                        style={{ transformStyle: 'preserve-3d', minHeight: '440px' }}
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
                            {/* Media-rich image header */}
                            <div className="relative">
                              <TrendCardMedia category={trend.category} platform={trend.platform} index={index} height="h-44" imageUrl={trend.data_json?.image_url} />
                              
                              {/* Platform badge */}
                              <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md text-white text-xs font-semibold border border-white/20 uppercase tracking-wider">
                                {trend.platform}
                              </div>
                              
                              {isHot && (
                                <motion.div
                                  className="absolute top-3 right-3 flex items-center gap-1 px-3 py-1 rounded-full border backdrop-blur-md"
                                  style={{ 
                                    background: 'linear-gradient(135deg, hsla(0,80%,50%,0.4), hsla(30,90%,50%,0.3))',
                                    borderColor: 'hsla(0,80%,60%,0.5)' 
                                  }}
                                  animate={{ scale: [1, 1.08, 1], boxShadow: ['0 0 10px hsla(0,80%,50%,0.2)', '0 0 25px hsla(0,80%,50%,0.5)', '0 0 10px hsla(0,80%,50%,0.2)'] }}
                                  transition={{ duration: 1.5, repeat: Infinity }}
                                >
                                  <Flame className="w-3 h-3 text-red-300" />
                                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">Hot</span>
                                </motion.div>
                              )}
                              
                              {!isHot && trend.data_json?.estimated_virality && (
                                <motion.div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md text-white text-xs font-bold border border-white/20" animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                                  🔥 {trend.data_json.estimated_virality}
                                </motion.div>
                              )}

                              {/* Category frosted tag */}
                              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/30 backdrop-blur-md text-white/90 text-[10px] font-medium border border-white/10">
                                <Tag className="w-2.5 h-2.5" />
                                {trend.trend_type}
                              </div>
                            </div>

                            <CardContent className="p-5 space-y-4">
                              <div className="flex items-start justify-between gap-3">
                                <h3 className="font-display font-bold text-lg group-hover:text-primary transition-colors line-clamp-2 flex-1">{trend.name}</h3>
                                <Button variant={bookmarked.includes(trend.id) ? "default" : "outline"} size="icon"
                                  onClick={(e) => { e.stopPropagation(); toggleBookmark(trend.id); }}
                                  className={`shrink-0 h-8 w-8 transition-all ${bookmarked.includes(trend.id) ? 'bg-primary text-primary-foreground shadow-[0_0_15px_hsla(43,90%,68%,0.4)]' : 'border-white/10 hover:border-primary/50'}`}
                                >
                                  {bookmarked.includes(trend.id) ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                                </Button>
                              </div>

                              <p className="text-sm text-muted-foreground line-clamp-2">{trend.description}</p>

                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <PopularityRing value={trend.popularity_index} size={36} />
                                  <div className="flex flex-col">
                                    <span className="text-xs text-muted-foreground">Popularity</span>
                                    <span className="text-sm font-bold text-primary">{trend.popularity_index}/100</span>
                                  </div>
                                </div>
                                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary"
                                  onClick={(e) => { e.stopPropagation(); toggleFlip(trend.id); }}
                                >
                                  {t('trends.quickFacts')} →
                                </Button>
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
                                  <ExternalLink className="w-4 h-4 mr-2" />{t('trends.learnMore')}
                                </Button>
                                <Button onClick={(e) => { e.stopPropagation(); analyzeTrend(trend); }} disabled={analyzing === trend.id} className="flex-1 relative overflow-hidden bg-gradient-to-r from-primary/80 to-primary hover:from-primary hover:to-primary/90 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.3)] transition-all" size="sm">
                                  {analyzing === trend.id ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('trends.analyzing')}</>) : (<><Sparkles className="w-4 h-4 mr-2" />{t('trends.analyze')}</>)}
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
                                <h3 className="font-bold text-lg text-primary">{t('trends.quickFacts')}</h3>
                                <Button variant="ghost" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); toggleFlip(trend.id); }}>← {t('trends.back')}</Button>
                              </div>
                              
                              <div className="space-y-3">
                                <div className="p-3 bg-muted/10 rounded-lg border border-white/5">
                                  <span className="text-xs text-muted-foreground">{t('trends.platformLabel')}</span>
                                  <p className="font-semibold capitalize">{trend.platform}</p>
                                </div>
                                <div className="p-3 bg-muted/10 rounded-lg border border-white/5">
                                  <span className="text-xs text-muted-foreground">{t('trends.categoryLabel')}</span>
                                  <p className="font-semibold">{trend.category || t('trends.general')}</p>
                                </div>
                                <div className="p-3 bg-muted/10 rounded-lg border border-white/5">
                                  <span className="text-xs text-muted-foreground">{t('trends.type')}</span>
                                  <p className="font-semibold">{trend.trend_type}</p>
                                </div>
                                <div className="p-3 bg-muted/10 rounded-lg border border-white/5">
                                  <span className="text-xs text-muted-foreground">{t('trends.popularityLabel')}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-primary text-xl">{trend.popularity_index}</span>
                                    <span className="text-muted-foreground text-sm">/ 100</span>
                                  </div>
                                </div>
                                {trend.data_json?.audience_fit && (
                                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Target className="w-3 h-3" /> {t('trends.targetAudience')}</span>
                                    <p className="text-sm mt-1">{trend.data_json.audience_fit}</p>
                                  </div>
                                )}
                              </div>

                              <Button onClick={() => analyzeTrend(trend)} className="w-full bg-gradient-to-r from-primary/80 to-primary" size="sm">
                                <Sparkles className="w-4 h-4 mr-2" />{t('trends.fullAnalysis')}
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
