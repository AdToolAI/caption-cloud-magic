import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Sparkles, Bookmark, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

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

  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [expandedTrend, setExpandedTrend] = useState<string | null>(null);
  const [trendIdeas, setTrendIdeas] = useState<Record<string, TrendIdeas>>({});
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    fetchTrends();
    fetchBookmarks();
  }, []);

  const fetchTrends = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-trends', {
        body: { language: 'en', platform: platformFilter !== 'all' ? platformFilter : null, category: categoryFilter !== 'all' ? categoryFilter : null }
      });

      if (error) throw error;
      setTrends(data.trends || []);
    } catch (error) {
      console.error('Error fetching trends:', error);
      toast({
        title: t('trendRadar.error_loading'),
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
      setBookmarked(new Set(data.map(b => b.trend_id)));
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
    }
  };

  const analyzeTrend = async (trend: Trend) => {
    if (trendIdeas[trend.id]) {
      setExpandedTrend(expandedTrend === trend.id ? null : trend.id);
      return;
    }

    setAnalyzing(trend.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please log in to analyze trends",
          variant: "destructive",
        });
        navigate('/auth');
        return;
      }

      const { data, error } = await supabase.functions.invoke('analyze-trend', {
        body: {
          trend_name: trend.name,
          trend_description: trend.description,
          platform: trend.platform,
          language: trend.language
        }
      });

      if (error) throw error;

      setTrendIdeas(prev => ({ ...prev, [trend.id]: data }));
      setExpandedTrend(trend.id);
      toast({
        title: "Analysis complete",
        description: `Generated ${data.ideas.length} content ideas`,
      });
    } catch (error) {
      console.error('Error analyzing trend:', error);
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setAnalyzing(null);
    }
  };

  const toggleBookmark = async (trendId: string) => {
    try {
      if (bookmarked.has(trendId)) {
        await supabase
          .from('trend_bookmarks')
          .delete()
          .eq('trend_id', trendId);
        
        setBookmarked(prev => {
          const next = new Set(prev);
          next.delete(trendId);
          return next;
        });
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
        
        setBookmarked(prev => new Set(prev).add(trendId));
        toast({ title: t('trendRadar.bookmarked') });
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

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'tiktok': return 'bg-gradient-to-r from-[#FF0050] to-[#00F2EA]';
      case 'instagram': return 'bg-gradient-to-r from-[#F58529] to-[#DD2A7B]';
      case 'linkedin': return 'bg-gradient-to-r from-[#0A66C2] to-[#004182]';
      default: return 'bg-primary';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold">{t('trendRadar.trend_title')}</h1>
        </div>
        <p className="text-muted-foreground mb-8">{t('trendRadar.trending_now')}</p>

        {/* Filters */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('trendRadar.filter_platform')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('trendRadar.filter_category')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="Lifestyle">Lifestyle</SelectItem>
              <SelectItem value="Business">Business</SelectItem>
              <SelectItem value="Fitness">Fitness</SelectItem>
              <SelectItem value="Food">Food</SelectItem>
              <SelectItem value="Productivity">Productivity</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={fetchTrends} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {t('trendRadar.fetch_button')}
          </Button>
        </div>

        {/* Trends Grid */}
        {loading && trends.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : trends.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">{t('trendRadar.no_trends')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {trends.map((trend) => (
              <Card key={trend.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={`${getPlatformColor(trend.platform)} text-white border-0 capitalize`}>
                          {trend.platform}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {trend.trend_type}
                        </Badge>
                      </div>
                      <CardTitle className="text-xl">{trend.name}</CardTitle>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleBookmark(trend.id)}
                    >
                      <Bookmark
                        className={`h-5 w-5 ${bookmarked.has(trend.id) ? 'fill-primary text-primary' : ''}`}
                      />
                    </Button>
                  </div>
                  <CardDescription>{trend.description}</CardDescription>
                  
                  <div className="flex items-center gap-2 mt-4">
                    <span className="text-sm text-muted-foreground">{t('trendRadar.popularity')}</span>
                    <Progress value={trend.popularity_index} className="flex-1" />
                    <span className="text-sm font-medium">{trend.popularity_index}</span>
                  </div>
                </CardHeader>

                <CardContent>
                  <Button
                    onClick={() => analyzeTrend(trend)}
                    disabled={analyzing === trend.id}
                    className="w-full"
                    variant={expandedTrend === trend.id ? "outline" : "default"}
                  >
                    {analyzing === trend.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('trendRadar.analyzing')}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        {expandedTrend === trend.id ? (
                          <>
                            {t('trendRadar.ideas')}
                            <ChevronUp className="h-4 w-4 ml-2" />
                          </>
                        ) : (
                          <>
                            {t('trendRadar.view_ideas')}
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </>
                        )}
                      </>
                    )}
                  </Button>

                  {expandedTrend === trend.id && trendIdeas[trend.id] && (
                    <div className="mt-4 space-y-4 border-t pt-4">
                      <div>
                        <h4 className="font-semibold mb-2">Summary</h4>
                        <p className="text-sm text-muted-foreground">{trendIdeas[trend.id].summary}</p>
                      </div>

                      <div>
                        <h4 className="font-semibold mb-2">{t('trendRadar.ideas')}</h4>
                        <div className="space-y-3">
                          {trendIdeas[trend.id].ideas.map((idea, idx) => (
                            <div key={idx} className="bg-muted/50 rounded-lg p-3">
                              <p className="font-medium text-sm mb-1">{idea.title}</p>
                              <p className="text-xs text-muted-foreground mb-1">Hook: "{idea.hook}"</p>
                              <p className="text-xs text-muted-foreground">{idea.caption_outline}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-semibold mb-2">Suggested Hashtags</h4>
                        <div className="flex flex-wrap gap-1">
                          {trendIdeas[trend.id].suggested_hashtags.map((tag, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => navigate('/generator')} className="flex-1">
                          {t('trendRadar.generate_post')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigate('/campaigns')} className="flex-1">
                          {t('trendRadar.add_to_campaign')}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
