import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useAICall } from "@/hooks/useAICall";
import { FEATURE_COSTS } from "@/lib/featureCosts";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Sparkles, Bookmark, Loader2, Search, Tag, Lightbulb, Target, Zap } from "lucide-react";

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
  
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'discover' | 'saved'>('discover');

  useEffect(() => {
    fetchTrends();
    fetchBookmarks();
  }, [platformFilter, categoryFilter]);

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
    try {
      const { data, error } = await supabase
        .from('trend_bookmarks')
        .select('trend_id');
      
      if (error) throw error;
      setBookmarked(data.map(b => b.trend_id));
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
    }
  };

  const analyzeTrend = async (trend: Trend) => {
    if (trendIdeas[trend.id]) {
      setExpandedTrend(expandedTrend === trend.id ? null : trend.id);
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
        title: "Analysis complete",
        description: `Generated ${data.content_ideas?.length || data.ideas?.length} content ideas`,
      });
    } catch (error: any) {
      console.error('Error analyzing trend:', error);
      if (error.code !== 'INSUFFICIENT_CREDITS') {
        toast({
          title: "Analysis failed",
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: "destructive",
        });
      }
    } finally {
      setAnalyzing(null);
    }
  };

  const toggleBookmark = async (trendId: string) => {
    try {
      if (bookmarked.includes(trendId)) {
        await supabase
          .from('trend_bookmarks')
          .delete()
          .eq('trend_id', trendId);
        
        setBookmarked(prev => prev.filter(id => id !== trendId));
        toast({ title: "Bookmark removed" });
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/auth');
          return;
        }

        await supabase
          .from('trend_bookmarks')
          .insert({ trend_id: trendId, user_id: user.id });
        
        setBookmarked(prev => [...prev, trendId]);
        toast({ title: "Trend bookmarked" });
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Unknown error',
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
    { id: 'social-media', name: t('trends.niches.socialMedia'), icon: '💡', color: 'from-blue-500/20 to-purple-500/20' },
    { id: 'ecommerce', name: t('trends.niches.ecommerce'), icon: '🛒', color: 'from-green-500/20 to-emerald-500/20' },
    { id: 'lifestyle', name: t('trends.niches.lifestyle'), icon: '🌟', color: 'from-pink-500/20 to-rose-500/20' },
    { id: 'business', name: t('trends.niches.business'), icon: '🤖', color: 'from-indigo-500/20 to-blue-500/20' },
    { id: 'motivation', name: t('trends.niches.motivation'), icon: '🚀', color: 'from-orange-500/20 to-red-500/20' },
    { id: 'finance', name: t('trends.niches.finance'), icon: '💰', color: 'from-yellow-500/20 to-amber-500/20' },
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
      case 'tiktok': return 'bg-gradient-to-r from-pink-500/80 to-cyan-500/80 text-white';
      case 'instagram': return 'bg-gradient-to-r from-purple-500/80 to-pink-500/80 text-white';
      case 'linkedin': return 'bg-blue-600/80 text-white';
      case 'youtube': return 'bg-red-600/80 text-white';
      case 'pinterest': return 'bg-red-500/80 text-white';
      case 'twitter': return 'bg-sky-500/80 text-white';
      default: return 'bg-primary/80 text-primary-foreground';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 py-8">
        <div className="container mx-auto px-4 max-w-7xl">
          {/* Hero Section */}
          <div className="mb-12 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
                  {t('trends.title')}
                </h1>
                <p className="text-muted-foreground text-lg max-w-2xl">
                  {t('trends.subtitle')}
                </p>
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'discover' ? 'default' : 'outline'}
                  onClick={() => setViewMode('discover')}
                  className="gap-2"
                >
                  <TrendingUp className="w-4 h-4" />
                  {t('trends.discover')}
                </Button>
                <Button
                  variant={viewMode === 'saved' ? 'default' : 'outline'}
                  onClick={() => setViewMode('saved')}
                  className="gap-2"
                >
                  <Bookmark className="w-4 h-4" />
                  {t('trends.saved')} ({bookmarked.length})
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setTrends([]);
                    fetchTrends();
                  }}
                  className="gap-2"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Neu laden
                </Button>
              </div>
            </div>
          </div>

          {/* Niche Categories */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6">{t('trends.discoverNiche')}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {categories.map(cat => (
                <Card 
                  key={cat.id}
                  className={`cursor-pointer transition-all hover:scale-105 hover:shadow-lg bg-gradient-to-br ${cat.color} border-2 ${
                    categoryFilter === cat.id ? 'border-primary ring-2 ring-primary/20' : 'border-transparent'
                  }`}
                  onClick={() => setCategoryFilter(categoryFilter === cat.id ? 'all' : cat.id)}
                >
                  <CardContent className="p-4 text-center space-y-2">
                    <div className="text-3xl">{cat.icon}</div>
                    <p className="font-semibold text-sm">{cat.name}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* E-Commerce Subcategories */}
          {categoryFilter === 'ecommerce' && (
            <div className="mb-12">
              <h3 className="text-xl font-bold mb-4">E-Commerce Produkt-Kategorien</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {ecommerceSubcategories.map(sub => (
                  <Button
                    key={sub.id}
                    variant="outline"
                    className="h-auto py-3 flex flex-col items-center gap-2"
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
                ))}
              </div>
            </div>
          )}

          {/* Top Trends of the Week */}
          {viewMode === 'discover' && (
            <div className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-lg">
                    <Zap className="w-6 h-6 text-orange-500" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{t('trends.topTrends')}</h2>
                    <p className="text-sm text-muted-foreground">{t('trends.topTrendsSubtitle')}</p>
                  </div>
                </div>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                {topTrends.map((trend, index) => (
                  <Card 
                    key={trend.id}
                    className="relative overflow-hidden hover:shadow-xl transition-all cursor-pointer group"
                    onClick={() => analyzeTrend(trend)}
                  >
                    <div className="absolute top-2 left-2 z-10 flex items-center justify-center w-8 h-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-full text-white font-bold text-sm">
                      #{index + 1}
                    </div>
                    <CardContent className="p-6 space-y-3">
                      <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getPlatformColor(trend.platform)}`}>
                        {trend.platform}
                      </div>
                      <h3 className="font-bold text-lg group-hover:text-primary transition-colors">
                        {trend.name}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {trend.description}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-orange-500 to-red-500 h-2 rounded-full transition-all"
                            style={{ width: `${trend.popularity_index}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold">{trend.popularity_index}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Filters & Search */}
          <Card className="mb-8 border-2 shadow-lg">
            <CardContent className="p-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    {t('trends.search')}
                  </label>
                  <Input
                    placeholder={t('trends.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('trends.platform')}</label>
                  <Select value={platformFilter} onValueChange={setPlatformFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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

          {/* Trends Grid */}
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6 space-y-4">
                    <div className="h-6 bg-muted rounded" />
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-20 bg-muted rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredTrends.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  {viewMode === 'saved' ? 'No saved trends yet' : 'No trends found'}
                </p>
              </CardContent>
            </Card>
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

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredTrends.map((trend) => (
                  <Card 
                    key={trend.id} 
                    className="group hover:shadow-2xl transition-all duration-300 border-2 hover:border-primary/50 relative overflow-hidden cursor-pointer"
                    onClick={() => analyzeTrend(trend)}
                  >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPlatformColor(trend.platform)}`}>
                              {trend.platform}
                            </span>
                            <span className="px-3 py-1 rounded-full text-xs font-medium bg-muted">
                              {trend.trend_type}
                            </span>
                            {trend.data_json?.estimated_virality && (
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-600 dark:text-orange-400">
                                🔥 {trend.data_json.estimated_virality}
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-xl group-hover:text-primary transition-colors">
                            {trend.name}
                          </h3>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBookmark(trend.id);
                          }}
                          className="shrink-0 hover:scale-110 transition-transform"
                        >
                          <Bookmark 
                            className={`w-5 h-5 transition-all ${
                              bookmarked.includes(trend.id) 
                                ? 'fill-primary text-primary scale-110' 
                                : 'text-muted-foreground'
                            }`}
                          />
                        </Button>
                      </div>

                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {trend.description}
                      </p>

                      {/* Finance-specific data */}
                      {trend.category === 'finance' && trend.data_json?.stocks && (
                        <div className="space-y-2 p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20">
                          <p className="text-xs font-semibold text-green-700 dark:text-green-400">📈 Top Aktien</p>
                          {trend.data_json.stocks.slice(0, 3).map((stock: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-xs">
                              <span className="font-medium">{stock.symbol}</span>
                              <span className={`font-bold ${stock.change.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                                {stock.change}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {trend.category === 'finance' && trend.data_json?.crypto && (
                        <div className="space-y-2 p-3 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 rounded-lg border border-orange-500/20">
                          <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">₿ Top Krypto</p>
                          {trend.data_json.crypto.slice(0, 3).map((crypto: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-xs">
                              <span className="font-medium">{crypto.name}</span>
                              <span className={`font-bold ${crypto.change.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                                {crypto.change}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Health/Lifestyle-specific data */}
                      {trend.category === 'lifestyle' && trend.data_json?.food && (
                        <div className="space-y-2 p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20">
                          <p className="text-xs font-semibold text-green-700 dark:text-green-400">🌿 {trend.data_json.food}</p>
                          <p className="text-xs text-muted-foreground">{trend.data_json.benefits}</p>
                          {trend.data_json.vitamins && (
                            <div className="flex gap-1 flex-wrap">
                              {trend.data_json.vitamins.map((vitamin: string) => (
                                <span key={vitamin} className="px-2 py-0.5 bg-green-500/20 text-green-700 dark:text-green-400 rounded text-xs">
                                  Vitamin {vitamin}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Motivation-specific data */}
                      {trend.category === 'motivation' && trend.data_json?.quotes && (
                        <div className="space-y-2 p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20">
                          <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">💭 Motivation</p>
                          <p className="text-xs italic text-muted-foreground">
                            "{trend.data_json.quotes[0]}"
                          </p>
                        </div>
                      )}

                      {/* E-Commerce-specific data */}
                      {trend.category === 'ecommerce' && trend.data_json?.price_range && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="px-2 py-1 bg-green-500/20 text-green-700 dark:text-green-400 rounded font-medium">
                            {trend.data_json.price_range}
                          </span>
                          {trend.data_json.subcategory && (
                            <span className="px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded">
                              {ecommerceSubcategories.find(s => s.id === trend.data_json.subcategory)?.icon} {trend.data_json.subcategory}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Business Tools-specific data */}
                      {trend.category === 'business' && trend.data_json?.tools && (
                        <div className="space-y-2 p-3 bg-gradient-to-r from-indigo-500/10 to-blue-500/10 rounded-lg border border-indigo-500/20">
                          <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">🤖 KI-Tools</p>
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
                        <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                          <Target className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <p className="text-xs text-muted-foreground">{trend.data_json.audience_fit}</p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t('trends.popularity')}</span>
                          <span className="font-bold">{trend.popularity_index}/100</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${trend.popularity_index}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {trend.category && (
                          <div className="flex items-center gap-1 text-xs px-2 py-1 bg-muted rounded-md">
                            <Tag className="w-3 h-3" />
                            <span>{trend.category}</span>
                          </div>
                        )}
                        {trend.data_json?.content_ideas && (
                          <div className="flex items-center gap-1 text-xs px-2 py-1 bg-primary/10 text-primary rounded-md">
                            <Lightbulb className="w-3 h-3" />
                            <span>{trend.data_json.content_ideas.length} {t('trends.ideas')}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            analyzeTrend(trend);
                          }}
                          disabled={analyzing === trend.id}
                          className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-all"
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
                              {t('trends.viewDetails')}
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
