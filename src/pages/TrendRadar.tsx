import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
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
import { TrendingUp, Sparkles, Bookmark, BookmarkCheck, Loader2, Search, Tag, Lightbulb, Target, Zap, ExternalLink } from "lucide-react";
import { TrendDetailModal } from "@/components/trends/TrendDetailModal";
import { TrendRadarHeroHeader } from "@/components/trends/TrendRadarHeroHeader";

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

  // Fetch trends when filters change
  useEffect(() => {
    fetchTrends();
  }, [platformFilter, categoryFilter]);

  // Fetch bookmarks when user changes - separate effect
  useEffect(() => {
    console.log('[Bookmarks] User changed:', user?.id);
    if (user) {
      fetchBookmarks();
    } else {
      setBookmarked([]);
    }
  }, [user]);

  const fetchTrends = async () => {
    setLoading(true);
    try {
      const body: any = { language: 'en' };
      if (platformFilter !== 'all') body.platform = platformFilter;
      if (categoryFilter !== 'all') body.category = categoryFilter;
      
      const { data, error } = await supabase.functions.invoke('fetch-trends', {
        body
      });

      if (error) throw error;
      setTrends(data.trends || []);
    } catch (error) {
      console.error('Error fetching trends:', error);
      toast({
        title: "Error loading trends",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBookmarks = async () => {
    console.log('[Bookmarks] fetchBookmarks called, user:', user?.id);
    
    if (!user) {
      console.log('[Bookmarks] No user - clearing bookmarks');
      setBookmarked([]);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('trend_bookmarks')
        .select('trend_id')
        .eq('user_id', user.id);
      
      console.log('[Bookmarks] Query result:', { data, error, count: data?.length });
      
      if (error) throw error;
      
      const ids = data?.map(b => b.trend_id) || [];
      console.log('[Bookmarks] Setting bookmarked IDs:', ids);
      setBookmarked(ids);
    } catch (error) {
      console.error('[Bookmarks] Error fetching:', error);
      setBookmarked([]);
    }
  };

  const openTrendDetail = (trend: Trend, tab: 'overview' | 'analysis' | 'articles' | 'media' = 'overview') => {
    setSelectedTrend(trend);
    setModalDefaultTab(tab);
    setDetailModalOpen(true);
  };

  const analyzeTrend = async (trend: Trend, openModal: boolean = true) => {
    // If already analyzed, just open modal with analysis tab
    if (trendIdeas[trend.id]) {
      if (openModal) {
        setSelectedTrend(trend);
        setModalDefaultTab('analysis');
        setDetailModalOpen(true);
      }
      return;
    }

    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to analyze trends",
        variant: "destructive",
      });
      navigate('/auth');
      return;
    }

    // Open modal with analysis tab and show loading
    if (openModal) {
      setSelectedTrend(trend);
      setModalDefaultTab('analysis');
      setDetailModalOpen(true);
    }

    setAnalyzing(trend.id);
    try {
      const data = await executeAICall({
        featureCode: FEATURE_COSTS.TREND_FETCH,
        estimatedCost: 3,
        apiCall: async () => {
          const { data, error } = await supabase.functions.invoke('analyze-trend', {
            body: {
              trend_name: trend.name,
              trend_description: trend.description,
              platform: trend.platform,
              language: trend.language,
              trend_type: trend.trend_type,
              category: trend.category
            }
          });

          if (error) throw error;
          return data;
        }
      });

      setTrendIdeas(prev => ({ ...prev, [trend.id]: data }));
      setExpandedTrend(trend.id);
      toast({
        title: "Analyse abgeschlossen",
        description: `${data.content_ideas?.length || data.ideas?.length} Content-Ideen generiert`,
      });
    } catch (error: any) {
      console.error('Error analyzing trend:', error);
      if (error.code !== 'INSUFFICIENT_CREDITS') {
        toast({
          title: "Analyse fehlgeschlagen",
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: "destructive",
        });
      }
    } finally {
      setAnalyzing(null);
    }
  };

  const toggleBookmark = async (trendId: string) => {
    // Safety check: prevent bookmarking trends without ID
    if (!trendId) {
      console.error('[Bookmarks] Cannot bookmark trend without ID');
      toast({
        title: "Fehler",
        description: "Dieser Trend kann nicht gespeichert werden",
        variant: "destructive"
      });
      return;
    }

    const isCurrentlyBookmarked = bookmarked.includes(trendId);
    console.log('[Bookmarks] toggleBookmark called:', { trendId, isCurrentlyBookmarked, bookmarkedArray: bookmarked });
    
    try {
      if (isCurrentlyBookmarked) {
        // Delete bookmark - ensure we only delete our own
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser) {
          navigate('/auth');
          return;
        }
        
        const { error } = await supabase
          .from('trend_bookmarks')
          .delete()
          .eq('trend_id', trendId)
          .eq('user_id', currentUser.id);
        
        if (error) throw error;
        
        setBookmarked(prev => prev.filter(id => id !== trendId));
        toast({ title: "Bookmark entfernt" });
      } else {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser) {
          navigate('/auth');
          return;
        }

        const { error } = await supabase
          .from('trend_bookmarks')
          .insert({ trend_id: trendId, user_id: currentUser.id });
        
        if (error) throw error;
        
        setBookmarked(prev => [...prev, trendId]);
        toast({ title: "Trend gespeichert" });
      }
    } catch (error) {
      console.error('[Bookmarks] Error toggling bookmark:', error);
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: "destructive",
      });
    }
  };

  const filteredTrends = trends.filter(trend => {
    const matchesPlatform = platformFilter === 'all' || trend.platform === platformFilter;
    const matchesCategory = categoryFilter === 'all' || trend.category?.toLowerCase().includes(categoryFilter);
    const matchesSearch = searchQuery === '' || 
      trend.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trend.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBookmark = viewMode === 'discover' || bookmarked.includes(trend.id);
    
    return matchesPlatform && matchesCategory && matchesSearch && matchesBookmark;
  });

  const topTrends = [...trends]
    .sort((a, b) => b.popularity_index - a.popularity_index)
    .slice(0, 5);

  const categories = [
    { id: 'social-media', name: t('trends.niches.socialMedia'), icon: '💡', color: 'from-blue-500/20 to-purple-500/20', glowColor: 'hover:shadow-[0_0_30px_hsla(220,80%,60%,0.25)]' },
    { id: 'ecommerce', name: t('trends.niches.ecommerce'), icon: '🛒', color: 'from-green-500/20 to-emerald-500/20', glowColor: 'hover:shadow-[0_0_30px_hsla(140,60%,50%,0.25)]' },
    { id: 'lifestyle', name: t('trends.niches.lifestyle'), icon: '🌟', color: 'from-pink-500/20 to-rose-500/20', glowColor: 'hover:shadow-[0_0_30px_hsla(340,80%,60%,0.25)]' },
    { id: 'business', name: t('trends.niches.business'), icon: '🤖', color: 'from-indigo-500/20 to-blue-500/20', glowColor: 'hover:shadow-[0_0_30px_hsla(230,80%,60%,0.25)]' },
    { id: 'motivation', name: t('trends.niches.motivation'), icon: '🚀', color: 'from-orange-500/20 to-red-500/20', glowColor: 'hover:shadow-[0_0_30px_hsla(20,80%,60%,0.25)]' },
    { id: 'finance', name: t('trends.niches.finance'), icon: '💰', color: 'from-yellow-500/20 to-amber-500/20', glowColor: 'hover:shadow-[0_0_30px_hsla(43,90%,68%,0.25)]' },
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

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'tiktok': return 'bg-gradient-to-r from-pink-500/80 to-cyan-500/80 text-white shadow-[0_0_15px_hsla(340,80%,60%,0.3)]';
      case 'instagram': return 'bg-gradient-to-r from-purple-500/80 to-pink-500/80 text-white shadow-[0_0_15px_hsla(280,80%,60%,0.3)]';
      case 'linkedin': return 'bg-blue-600/80 text-white shadow-[0_0_15px_hsla(210,80%,50%,0.3)]';
      case 'youtube': return 'bg-red-600/80 text-white shadow-[0_0_15px_hsla(0,80%,50%,0.3)]';
      case 'pinterest': return 'bg-red-500/80 text-white shadow-[0_0_15px_hsla(0,70%,50%,0.3)]';
      case 'twitter': return 'bg-sky-500/80 text-white shadow-[0_0_15px_hsla(200,80%,50%,0.3)]';
      default: return 'bg-primary/80 text-primary-foreground shadow-[0_0_15px_hsla(43,90%,68%,0.3)]';
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
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
            onRefresh={() => {
              setTrends([]);
              fetchTrends();
            }}
            loading={loading}
            trendsCount={trends.length}
          />

          {/* Niche Categories */}
          <motion.div 
            className="mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <motion.div 
                className="p-3 bg-gradient-to-br from-primary/20 to-cyan-500/20 rounded-xl border border-primary/20"
                whileHover={{ scale: 1.05, rotate: 5 }}
              >
                <Sparkles className="w-6 h-6 text-primary" />
              </motion.div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {t('trends.discoverNiche')}
              </h2>
            </div>

            <motion.div 
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {categories.map((cat, index) => (
                <motion.div
                  key={cat.id}
                  variants={itemVariants}
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Card 
                    className={`cursor-pointer transition-all duration-300 backdrop-blur-xl bg-card/60 border-white/10 
                      bg-gradient-to-br ${cat.color} ${cat.glowColor}
                      ${categoryFilter === cat.id 
                        ? 'ring-2 ring-primary shadow-[0_0_30px_hsla(43,90%,68%,0.3)] border-primary/50' 
                        : 'hover:border-primary/30'
                      }`}
                    onClick={() => setCategoryFilter(categoryFilter === cat.id ? 'all' : cat.id)}
                  >
                    <CardContent className="p-4 text-center space-y-2">
                      <motion.div 
                        className="text-3xl"
                        animate={categoryFilter === cat.id ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 0.5 }}
                      >
                        {cat.icon}
                      </motion.div>
                      <p className="font-semibold text-sm">{cat.name}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* E-Commerce Subcategories */}
          {categoryFilter === 'ecommerce' && (
            <motion.div 
              className="mb-12"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">🛒</span>
                E-Commerce Produkt-Kategorien
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {ecommerceSubcategories.map((sub, index) => (
                  <motion.div
                    key={sub.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Button
                      variant="outline"
                      className="h-auto py-3 w-full flex flex-col items-center gap-2 backdrop-blur-xl bg-card/60 border-white/10 hover:bg-card/80 hover:border-primary/50 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.15)] transition-all duration-300"
                      onClick={async () => {
                        setLoading(true);
                        try {
                          const { data, error } = await supabase.functions.invoke('fetch-trends', {
                            body: { language: 'en', category: 'ecommerce' }
                          });
                          
                          if (error) throw error;
                          
                          const filtered = (data.trends || []).filter((t: any) => 
                            t.data_json?.subcategory === sub.id
                          );
                          setTrends(filtered);
                        } catch (error) {
                          console.error('Error fetching subcategory trends:', error);
                          toast({
                            title: "Fehler beim Laden",
                            description: "Trends konnten nicht geladen werden",
                            variant: "destructive",
                          });
                        } finally {
                          setLoading(false);
                        }
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

          {/* Top Trends of the Week */}
          {viewMode === 'discover' && (
            <motion.div 
              className="mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <motion.div 
                    className="p-3 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-xl border border-orange-500/20"
                    animate={{ 
                      boxShadow: [
                        '0 0 20px hsla(30, 80%, 50%, 0.2)',
                        '0 0 40px hsla(30, 80%, 50%, 0.4)',
                        '0 0 20px hsla(30, 80%, 50%, 0.2)'
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Zap className="w-6 h-6 text-orange-500" />
                  </motion.div>
                  <div>
                    <h2 className="text-2xl font-bold">{t('trends.topTrends')}</h2>
                    <p className="text-sm text-muted-foreground">{t('trends.topTrendsSubtitle')}</p>
                  </div>
                </div>
              </div>
              
              <motion.div 
                className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {topTrends.map((trend, index) => {
                  const isFeatured = index === 0;
                  const platformGradient = (() => {
                    switch (trend.platform) {
                      case 'tiktok': return 'from-pink-600 via-purple-600 to-cyan-500';
                      case 'instagram': return 'from-purple-600 via-pink-500 to-orange-400';
                      case 'youtube': return 'from-red-700 via-red-600 to-red-500';
                      case 'linkedin': return 'from-blue-700 via-blue-600 to-blue-500';
                      case 'twitter': return 'from-sky-600 via-sky-500 to-blue-400';
                      default: return 'from-primary via-purple-500 to-pink-500';
                    }
                  })();
                  return (
                    <motion.div
                      key={trend.id}
                      variants={itemVariants}
                      whileHover={{ y: -8, scale: 1.02 }}
                      className={isFeatured ? 'md:col-span-2 lg:col-span-1' : ''}
                    >
                      <Card 
                        className="relative overflow-hidden cursor-pointer group backdrop-blur-xl bg-card/40 border-white/10 hover:border-primary/50 hover:shadow-[0_0_40px_hsla(43,90%,68%,0.2)] transition-all duration-500 h-full"
                        onClick={() => analyzeTrend(trend)}
                      >
                        {/* Platform Gradient Header with Scanlines */}
                        <div className={`relative h-32 bg-gradient-to-br ${platformGradient} overflow-hidden`}>
                          {/* Scanline overlay */}
                          <div className="absolute inset-0 opacity-10" style={{
                            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)',
                          }} />
                          {/* Animated shimmer */}
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                            animate={{ x: ['-100%', '200%'] }}
                            transition={{ duration: 3, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }}
                          />
                          {/* Ranking Badge */}
                          <motion.div 
                            className="absolute top-3 left-3 z-10 flex items-center justify-center w-10 h-10 bg-black/40 backdrop-blur-md rounded-full text-white font-bold text-base border border-white/20 shadow-[0_0_20px_hsla(0,0%,100%,0.2)]"
                            whileHover={{ scale: 1.15, rotate: 10 }}
                          >
                            #{index + 1}
                          </motion.div>
                          {/* Platform label */}
                          <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full bg-black/30 backdrop-blur-sm text-white text-xs font-semibold border border-white/20 uppercase tracking-wider">
                            {trend.platform}
                          </div>
                          {/* Popularity score */}
                          <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/30 backdrop-blur-sm text-white text-sm font-bold border border-white/20">
                            🔥 {trend.popularity_index}
                          </div>
                        </div>

                        <CardContent className="p-5 space-y-3">
                          <h3 className="font-bold text-lg group-hover:text-primary transition-colors line-clamp-2">
                            {trend.name}
                          </h3>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {trend.description}
                          </p>
                          {/* Neon Popularity Bar */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-muted/30 rounded-full h-2 overflow-hidden relative">
                              <motion.div 
                                className={`bg-gradient-to-r ${platformGradient} h-2 rounded-full relative`}
                                initial={{ width: 0 }}
                                animate={{ width: `${trend.popularity_index}%` }}
                                transition={{ duration: 1.2, delay: index * 0.1, ease: 'easeOut' }}
                              />
                              <motion.div
                                className={`absolute top-0 left-0 h-2 rounded-full bg-gradient-to-r ${platformGradient} blur-sm opacity-60`}
                                initial={{ width: 0 }}
                                animate={{ width: `${trend.popularity_index}%` }}
                                transition={{ duration: 1.2, delay: index * 0.1, ease: 'easeOut' }}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          )}

          {/* Filters & Search */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="mb-8 backdrop-blur-xl bg-card/60 border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
              <CardContent className="p-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Search className="w-4 h-4 text-primary" />
                      {t('trends.search')}
                    </label>
                    <Input
                      placeholder={t('trends.searchPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('trends.platform')}</label>
                    <Select value={platformFilter} onValueChange={setPlatformFilter}>
                      <SelectTrigger className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20">
                        <SelectValue />
                      </SelectTrigger>
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
                      <SelectTrigger className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20">
                        <SelectValue />
                      </SelectTrigger>
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
            <motion.div 
              className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <motion.div key={i} variants={itemVariants}>
                  <Card className="backdrop-blur-xl bg-card/60 border-white/10 overflow-hidden">
                    <CardContent className="p-6 space-y-4">
                      <div className="h-6 bg-gradient-to-r from-muted/50 via-muted to-muted/50 rounded animate-pulse" />
                      <div className="h-4 bg-gradient-to-r from-muted/50 via-muted to-muted/50 rounded w-3/4 animate-pulse" />
                      <div className="h-20 bg-gradient-to-r from-muted/50 via-muted to-muted/50 rounded animate-pulse" />
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          ) : filteredTrends.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Card className="backdrop-blur-xl bg-card/60 border-white/10">
                <CardContent className="py-12 text-center space-y-4">
                  {viewMode === 'saved' ? (
                    <>
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="inline-block"
                      >
                        <Bookmark className="w-16 h-16 text-muted-foreground/50 mx-auto" />
                      </motion.div>
                      <p className="text-muted-foreground text-lg">
                        Du hast noch keine Trends gespeichert
                      </p>
                      <p className="text-sm text-muted-foreground/70 max-w-md mx-auto">
                        Klicke auf das Bookmark-Symbol bei einem Trend, um ihn für später zu speichern
                      </p>
                      <Button 
                        onClick={() => setViewMode('discover')}
                        className="bg-gradient-to-r from-primary to-primary/80 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.3)] transition-all"
                      >
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Trends entdecken
                      </Button>
                    </>
                  ) : (
                    <>
                      <motion.div
                        animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="inline-block"
                      >
                        <TrendingUp className="w-16 h-16 text-muted-foreground/50 mx-auto" />
                      </motion.div>
                      <p className="text-muted-foreground text-lg">
                        Keine Trends gefunden
                      </p>
                      <Button 
                        onClick={fetchTrends}
                        className="bg-gradient-to-r from-primary to-primary/80 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.3)] transition-all"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Trends neu laden
                      </Button>
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
                  <span className="ml-2 text-muted-foreground text-lg">
                    ({filteredTrends.length})
                  </span>
                </h2>
              </div>

              <motion.div 
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {filteredTrends.map((trend, index) => (
                  <motion.div
                    key={trend.id}
                    variants={itemVariants}
                    whileHover={{ y: -8 }}
                  >
                    <Card 
                      className="group cursor-pointer relative overflow-hidden backdrop-blur-xl bg-card/60 border-white/10 hover:border-primary/50 hover:shadow-[0_0_30px_hsla(43,90%,68%,0.15)] transition-all duration-300"
                      onClick={() => analyzeTrend(trend)}
                    >
                      {/* Top Gradient Line */}
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                      
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPlatformColor(trend.platform)}`}>
                                {trend.platform}
                              </span>
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-muted/50 border border-white/10">
                                {trend.trend_type}
                              </span>
                              {trend.data_json?.estimated_virality && (
                                <motion.span 
                                  className="px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-400 border border-orange-500/30"
                                  animate={{ scale: [1, 1.05, 1] }}
                                  transition={{ duration: 1.5, repeat: Infinity }}
                                >
                                  🔥 {trend.data_json.estimated_virality}
                                </motion.span>
                              )}
                            </div>
                            <h3 className="font-bold text-xl group-hover:text-primary transition-colors">
                              {trend.name}
                            </h3>
                          </div>
                          
                          {/* Improved Bookmark Button */}
                          <Button
                            variant={bookmarked.includes(trend.id) ? "default" : "outline"}
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleBookmark(trend.id);
                            }}
                            className={`shrink-0 gap-1.5 transition-all ${
                              bookmarked.includes(trend.id) 
                                ? 'bg-primary text-primary-foreground shadow-[0_0_15px_hsla(43,90%,68%,0.4)]' 
                                : 'border-white/10 hover:border-primary/50'
                            }`}
                          >
                            {bookmarked.includes(trend.id) ? (
                              <>
                                <BookmarkCheck className="w-4 h-4" />
                                <span className="hidden sm:inline">Gespeichert</span>
                              </>
                            ) : (
                              <>
                                <Bookmark className="w-4 h-4" />
                                <span className="hidden sm:inline">Speichern</span>
                              </>
                            )}
                          </Button>
                        </div>

                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {trend.description}
                        </p>

                        {/* Finance-specific data */}
                        {trend.category === 'finance' && trend.data_json?.stocks && (
                          <div className="space-y-2 p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20 backdrop-blur-sm">
                            <p className="text-xs font-semibold text-green-400">📈 Top Aktien</p>
                            {trend.data_json.stocks.slice(0, 3).map((stock: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-center text-xs">
                                <span className="font-medium">{stock.symbol}</span>
                                <span className={`font-bold ${stock.change.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>
                                  {stock.change}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {trend.category === 'finance' && trend.data_json?.crypto && (
                          <div className="space-y-2 p-3 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 rounded-lg border border-orange-500/20 backdrop-blur-sm">
                            <p className="text-xs font-semibold text-orange-400">₿ Top Krypto</p>
                            {trend.data_json.crypto.slice(0, 3).map((crypto: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-center text-xs">
                                <span className="font-medium">{crypto.name}</span>
                                <span className={`font-bold ${crypto.change.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>
                                  {crypto.change}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Health/Lifestyle-specific data */}
                        {trend.category === 'lifestyle' && trend.data_json?.food && (
                          <div className="space-y-2 p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20 backdrop-blur-sm">
                            <p className="text-xs font-semibold text-green-400">🌿 {trend.data_json.food}</p>
                            <p className="text-xs text-muted-foreground">{trend.data_json.benefits}</p>
                            {trend.data_json.vitamins && (
                              <div className="flex gap-1 flex-wrap">
                                {trend.data_json.vitamins.map((vitamin: string) => (
                                  <span key={vitamin} className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs border border-green-500/30">
                                    Vitamin {vitamin}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Motivation-specific data */}
                        {trend.category === 'motivation' && trend.data_json?.quotes && (
                          <div className="space-y-2 p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20 backdrop-blur-sm">
                            <p className="text-xs font-semibold text-purple-400">💭 Motivation</p>
                            <p className="text-xs italic text-muted-foreground">
                              "{trend.data_json.quotes[0]}"
                            </p>
                          </div>
                        )}

                        {/* E-Commerce-specific data */}
                        {trend.category === 'ecommerce' && trend.data_json?.price_range && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded font-medium border border-green-500/30">
                              {trend.data_json.price_range}
                            </span>
                            {trend.data_json.subcategory && (
                              <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded border border-blue-500/30">
                                {ecommerceSubcategories.find(s => s.id === trend.data_json.subcategory)?.icon} {trend.data_json.subcategory}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Business Tools-specific data */}
                        {trend.category === 'business' && trend.data_json?.tools && (
                          <div className="space-y-2 p-3 bg-gradient-to-r from-indigo-500/10 to-blue-500/10 rounded-lg border border-indigo-500/20 backdrop-blur-sm">
                            <p className="text-xs font-semibold text-indigo-400">🤖 KI-Tools</p>
                            <div className="space-y-1">
                              {trend.data_json.tools.slice(0, 3).map((tool: any, idx: number) => (
                                <div key={idx} className="text-xs">
                                  <span className="font-medium">{tool.name}</span>
                                  <span className="text-muted-foreground"> – {tool.pricing}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {trend.data_json?.audience_fit && (
                          <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg border border-white/5">
                            <Target className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <p className="text-xs text-muted-foreground">{trend.data_json.audience_fit}</p>
                          </div>
                        )}

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{t('trends.popularity')}</span>
                            <span className="font-bold text-primary">{trend.popularity_index}/100</span>
                          </div>
                          <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden">
                            <motion.div 
                              className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 h-2 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${trend.popularity_index}%` }}
                              transition={{ duration: 1, delay: index * 0.05 }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {trend.category && (
                            <div className="flex items-center gap-1 text-xs px-2 py-1 bg-muted/30 rounded-md border border-white/5">
                              <Tag className="w-3 h-3" />
                              <span>{trend.category}</span>
                            </div>
                          )}
                          {trend.data_json?.content_ideas && (
                            <div className="flex items-center gap-1 text-xs px-2 py-1 bg-primary/10 text-primary rounded-md border border-primary/20">
                              <Lightbulb className="w-3 h-3" />
                              <span>{trend.data_json.content_ideas.length} {t('trends.ideas')}</span>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-white/5 flex gap-2">
                          {/* More Info Button */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTrendDetail(trend);
                            }}
                            className="flex-1 border-white/10 hover:border-primary/50 hover:bg-primary/5"
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Mehr erfahren
                          </Button>
                          
                          {/* Analyze Button */}
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              analyzeTrend(trend);
                            }}
                            disabled={analyzing === trend.id}
                            className="flex-1 relative overflow-hidden bg-gradient-to-r from-primary/80 to-primary hover:from-primary hover:to-primary/90 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.3)] transition-all"
                            size="sm"
                          >
                            {analyzing === trend.id ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {t('trends.analyzing')}
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Analysieren
                              </>
                            )}
                            <motion.div
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                              animate={{ x: ['-100%', '100%'] }}
                              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                            />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            </>
          )}
        </div>
      </main>

      {/* Trend Detail Modal */}
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
