import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Bookmark, 
  BookmarkCheck,
  ExternalLink, 
  Loader2, 
  Sparkles, 
  Tag, 
  TrendingUp,
  Lightbulb,
  Hash,
  Target,
  Link2,
  Calendar,
  Search,
  Zap,
  Clock,
  AlertTriangle,
  CheckCircle,
  FileText,
  Play,
  Video
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

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

interface RelatedArticle {
  title: string;
  url: string;
  description: string;
  source?: string;
}

interface RelatedVideo {
  title: string;
  search_url: string;
  thumbnail: string | null;
  query: string;
}

interface AnalysisData {
  trend_name: string;
  summary: string;
  content_ideas?: Array<{
    title: string;
    hook: string;
    description?: string;
    format?: string;
    estimated_virality?: string;
    caption_outline?: string;
  }>;
  ideas?: Array<{
    title: string;
    hook: string;
    caption_outline?: string;
  }>;
  suggested_hashtags?: string[];
  hashtag_strategy?: {
    core?: string[];
    discovery?: string[];
    niche?: string[];
  };
  recommended_platforms?: string[];
  best_posting_times?: string[];
  pro_tips?: string[];
  mistakes_to_avoid?: string[];
}

interface TrendDetailModalProps {
  trend: Trend | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isBookmarked: boolean;
  onToggleBookmark: (trendId: string) => void;
  bookmarkDate?: string;
  analysisData?: AnalysisData | null;
  onAnalyze?: (trend: Trend) => void;
  isAnalyzing?: boolean;
  defaultTab?: 'overview' | 'analysis' | 'articles' | 'media';
}

export function TrendDetailModal({
  trend,
  open,
  onOpenChange,
  isBookmarked,
  onToggleBookmark,
  bookmarkDate,
  analysisData,
  onAnalyze,
  isAnalyzing = false,
  defaultTab = 'overview',
}: TrendDetailModalProps) {
  const { toast } = useToast();
  const [articles, setArticles] = useState<RelatedArticle[]>([]);
  const [videos, setVideos] = useState<RelatedVideo[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [mediaLoaded, setMediaLoaded] = useState(false);

  useEffect(() => {
    if (open && trend) {
      setActiveTab(defaultTab);
      setMediaLoaded(false);
      if (defaultTab === 'articles' || defaultTab === 'media') {
        fetchMedia();
      }
    }
  }, [open, trend?.id, defaultTab]);

  useEffect(() => {
    if ((activeTab === 'articles' || activeTab === 'media') && !mediaLoaded && !loadingArticles) {
      fetchMedia();
    }
  }, [activeTab]);

  const fetchMedia = async () => {
    if (!trend || mediaLoaded) return;
    
    setLoadingArticles(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-trend-articles', {
        body: {
          trend_name: trend.name,
          trend_description: trend.description,
          platform: trend.platform,
          category: trend.category,
        }
      });

      if (error) throw error;
      setArticles(data.articles || []);
      setVideos(data.videos || []);
      setMediaLoaded(true);
    } catch (error) {
      console.error('Error fetching articles:', error);
    } finally {
      setLoadingArticles(false);
    }
  };

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

  const ideas = (analysisData?.content_ideas || analysisData?.ideas || []) as Array<{
    title: string;
    hook?: string;
    description?: string;
    format?: string;
    estimated_virality?: string;
    caption_outline?: string;
  }>;
  const hashtags = analysisData?.suggested_hashtags || [];
  const hashtagStrategy = analysisData?.hashtag_strategy;

  if (!trend) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden backdrop-blur-xl bg-card/95 border-white/10">
        {/* Header with gradient */}
        <div className="relative p-6 pb-4 bg-gradient-to-b from-primary/10 to-transparent border-b border-white/5">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={getPlatformColor(trend.platform)}>
                    {trend.platform}
                  </Badge>
                  <Badge variant="outline" className="border-white/20">
                    {trend.trend_type}
                  </Badge>
                  {trend.category && (
                    <Badge variant="outline" className="border-white/20">
                      <Tag className="w-3 h-3 mr-1" />
                      {trend.category}
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-2xl font-bold pr-12">
                  {trend.name}
                </DialogTitle>
              </div>
            </div>
          </DialogHeader>

          {/* Popularity Bar */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Popularität
              </span>
              <span className="font-bold text-primary">{trend.popularity_index}/100</span>
            </div>
            <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden">
              <motion.div 
                className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${trend.popularity_index}%` }}
                transition={{ duration: 0.8 }}
              />
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
          <div className="px-6 pt-2">
            <TabsList className="w-full bg-muted/30 border border-white/5">
              <TabsTrigger value="overview" className="flex-1 gap-2 data-[state=active]:bg-primary/20">
                <FileText className="w-4 h-4" />
                Übersicht
              </TabsTrigger>
              <TabsTrigger value="analysis" className="flex-1 gap-2 data-[state=active]:bg-primary/20">
                <Sparkles className="w-4 h-4" />
                KI-Analyse
                {analysisData && (
                  <Badge variant="secondary" className="ml-1 text-xs bg-green-500/20 text-green-400">
                    ✓
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="articles" className="flex-1 gap-2 data-[state=active]:bg-primary/20">
                <Link2 className="w-4 h-4" />
                Artikel
                {articles.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs bg-blue-500/20 text-blue-400">
                    {articles.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="media" className="flex-1 gap-2 data-[state=active]:bg-primary/20">
                <Video className="w-4 h-4" />
                Medien
                {videos.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs bg-red-500/20 text-red-400">
                    {videos.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 max-h-[50vh]">
            {/* Overview Tab */}
            <TabsContent value="overview" className="p-6 space-y-6 mt-0">
              {/* Description */}
              <div className="space-y-2">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Beschreibung
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {trend.description}
                </p>
              </div>

              {/* Content Ideas from trend data */}
              {trend.data_json?.content_ideas && trend.data_json.content_ideas.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-yellow-500" />
                    Content-Ideen
                  </h3>
                  <div className="space-y-2">
                    {trend.data_json.content_ideas.map((idea: { title?: string; description?: string; format?: string } | string, idx: number) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg border border-white/5"
                      >
                        <span className="text-primary font-bold">{idx + 1}.</span>
                        <div className="space-y-1 flex-1">
                          {typeof idea === 'string' ? (
                            <span className="text-sm">{idea}</span>
                          ) : (
                            <>
                              <p className="font-medium text-sm">{idea.title}</p>
                              {idea.description && (
                                <p className="text-sm text-muted-foreground">{idea.description}</p>
                              )}
                              {idea.format && (
                                <Badge variant="outline" className="text-xs border-white/20">
                                  {idea.format}
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hashtags from trend data */}
              {trend.data_json?.hashtags && trend.data_json.hashtags.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Hash className="w-5 h-5 text-cyan-500" />
                    Empfohlene Hashtags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {trend.data_json.hashtags.map((tag: string, idx: number) => (
                      <motion.span
                        key={idx}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        className="px-3 py-1 bg-cyan-500/10 text-cyan-400 rounded-full text-sm border border-cyan-500/20"
                      >
                        #{tag}
                      </motion.span>
                    ))}
                  </div>
                </div>
              )}

              {/* Audience Fit */}
              {trend.data_json?.audience_fit && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Target className="w-5 h-5 text-purple-500" />
                    Zielgruppe
                  </h3>
                  <p className="text-muted-foreground p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                    {trend.data_json.audience_fit}
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Analysis Tab */}
            <TabsContent value="analysis" className="p-6 space-y-6 mt-0">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  >
                    <Sparkles className="w-12 h-12 text-primary" />
                  </motion.div>
                  <p className="text-muted-foreground">KI analysiert den Trend...</p>
                  <p className="text-xs text-muted-foreground/60">Generiere Content-Strategien und Ideen</p>
                </div>
              ) : analysisData ? (
                <>
                  {/* Summary */}
                  {analysisData.summary && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-gradient-to-r from-primary/10 to-purple-500/10 rounded-xl border border-primary/20"
                    >
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary" />
                        Zusammenfassung
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {analysisData.summary}
                      </p>
                    </motion.div>
                  )}

                  {/* Content Ideas */}
                  {ideas.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-yellow-500" />
                        Content-Ideen ({ideas.length})
                      </h4>
                      <div className="space-y-3">
                        {ideas.map((idea, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                          >
                            <Card className="bg-muted/20 border-white/5 hover:border-primary/30 transition-colors">
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <h5 className="font-medium">{idea.title}</h5>
                                  <div className="flex gap-2 shrink-0">
                                    {idea.format && (
                                      <Badge variant="outline" className="text-xs border-cyan-500/30 text-cyan-400">
                                        {idea.format}
                                      </Badge>
                                    )}
                                    {idea.estimated_virality && (
                                      <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-400">
                                        🔥 {idea.estimated_virality}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                
                                {idea.hook && (
                                  <div className="p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                                    <p className="text-xs text-yellow-400 font-medium mb-1">Hook:</p>
                                    <p className="text-sm italic">"{idea.hook}"</p>
                                  </div>
                                )}
                                
                                {(idea.description || idea.caption_outline) && (
                                  <p className="text-sm text-muted-foreground">
                                    {idea.description || idea.caption_outline}
                                  </p>
                                )}
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hashtag Strategy */}
                  {(hashtags.length > 0 || hashtagStrategy) && (
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Hash className="w-5 h-5 text-cyan-500" />
                        Hashtag-Strategie
                      </h4>
                      
                      {hashtagStrategy ? (
                        <div className="grid gap-3 md:grid-cols-3">
                          {hashtagStrategy.core && hashtagStrategy.core.length > 0 && (
                            <div className="p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                              <p className="text-xs font-semibold text-cyan-400 mb-2">Core</p>
                              <div className="flex flex-wrap gap-1">
                                {hashtagStrategy.core.map((tag, i) => (
                                  <span key={i} className="text-xs px-2 py-0.5 bg-cyan-500/20 rounded">#{tag}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {hashtagStrategy.discovery && hashtagStrategy.discovery.length > 0 && (
                            <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                              <p className="text-xs font-semibold text-purple-400 mb-2">Discovery</p>
                              <div className="flex flex-wrap gap-1">
                                {hashtagStrategy.discovery.map((tag, i) => (
                                  <span key={i} className="text-xs px-2 py-0.5 bg-purple-500/20 rounded">#{tag}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {hashtagStrategy.niche && hashtagStrategy.niche.length > 0 && (
                            <div className="p-3 bg-pink-500/10 rounded-lg border border-pink-500/20">
                              <p className="text-xs font-semibold text-pink-400 mb-2">Niche</p>
                              <div className="flex flex-wrap gap-1">
                                {hashtagStrategy.niche.map((tag, i) => (
                                  <span key={i} className="text-xs px-2 py-0.5 bg-pink-500/20 rounded">#{tag}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {hashtags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1 bg-cyan-500/10 text-cyan-400 rounded-full text-sm border border-cyan-500/20"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Best Posting Times */}
                  {analysisData.best_posting_times && (
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Clock className="w-5 h-5 text-green-500" />
                        Beste Posting-Zeiten
                      </h4>
                      {typeof analysisData.best_posting_times === 'string' ? (
                        <p className="text-sm text-muted-foreground p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                          {analysisData.best_posting_times}
                        </p>
                      ) : Array.isArray(analysisData.best_posting_times) ? (
                        <div className="flex flex-wrap gap-2">
                          {analysisData.best_posting_times.map((time: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="border-green-500/30 text-green-400">
                              {time}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Recommended Platforms */}
                  {analysisData.recommended_platforms && analysisData.recommended_platforms.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Target className="w-5 h-5 text-purple-500" />
                        Empfohlene Plattformen
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {analysisData.recommended_platforms.map((platform, idx) => (
                          <Badge key={idx} className={getPlatformColor(platform.toLowerCase())}>
                            {platform}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pro Tips */}
                  {analysisData.pro_tips && analysisData.pro_tips.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        Pro-Tipps
                      </h4>
                      <div className="space-y-2">
                        {analysisData.pro_tips.map((tip, idx) => (
                          <div key={idx} className="flex items-start gap-2 p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                            <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                            <p className="text-sm">{tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mistakes to Avoid */}
                  {analysisData.mistakes_to_avoid && analysisData.mistakes_to_avoid.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                        Fehler vermeiden
                      </h4>
                      <div className="space-y-2">
                        {analysisData.mistakes_to_avoid.map((mistake, idx) => (
                          <div key={idx} className="flex items-start gap-2 p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-sm">{mistake}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 space-y-6">
                  <motion.div
                    className="p-6 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full"
                    animate={{ 
                      boxShadow: [
                        '0 0 20px hsla(43, 90%, 68%, 0.2)',
                        '0 0 40px hsla(43, 90%, 68%, 0.4)',
                        '0 0 20px hsla(43, 90%, 68%, 0.2)'
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Sparkles className="w-12 h-12 text-primary" />
                  </motion.div>
                  <div className="text-center space-y-2">
                    <h4 className="font-semibold text-lg">Noch keine Analyse vorhanden</h4>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Lass die KI diesen Trend analysieren und erhalte maßgeschneiderte Content-Strategien, Hooks und Hashtags.
                    </p>
                  </div>
                  <Button
                    onClick={() => onAnalyze?.(trend)}
                    disabled={isAnalyzing}
                    className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.3)] transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                    Jetzt analysieren (3 Credits)
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Articles Tab - Sci-Fi Glassmorphism Design */}
            <TabsContent value="articles" className="p-6 space-y-4 mt-0">
              {loadingArticles ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <motion.div
                    className="relative w-16 h-16"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  >
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/50 animate-pulse" />
                    <div className="absolute inset-2 rounded-full border border-transparent border-b-cyan-500/60" />
                    <Search className="absolute inset-0 m-auto w-6 h-6 text-primary" />
                  </motion.div>
                  <p className="text-sm text-muted-foreground font-medium tracking-wide">
                    Web-Suche läuft...
                  </p>
                </div>
              ) : articles.length > 0 ? (
                <div className="space-y-3">
                  {/* Powered by badge */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/5 border border-primary/20 text-xs text-primary/80">
                      <Zap className="w-3 h-3" />
                      <span className="tracking-wider uppercase font-semibold">Live Web-Suche</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{articles.length} Quellen</span>
                  </div>

                  {articles.map((article, idx) => {
                    const source = article.source || (() => {
                      try { return new URL(article.url).hostname.replace('www.', ''); } catch { return ''; }
                    })();
                    return (
                      <motion.a
                        key={idx}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.08, type: "spring", stiffness: 200 }}
                        className="group relative block p-4 rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-sm hover:border-primary/40 hover:shadow-[0_0_30px_-5px_hsl(var(--primary)/0.15)] transition-all duration-300"
                      >
                        {/* Shimmer border on hover */}
                        <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none overflow-hidden">
                          <div className="absolute inset-0 rounded-xl border border-primary/20" />
                        </div>

                        <div className="relative flex items-start gap-4">
                          {/* Favicon with glow ring */}
                          {source && (
                            <div className="relative shrink-0 mt-0.5">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-white/[0.02] border border-white/10 flex items-center justify-center group-hover:border-primary/30 group-hover:shadow-[0_0_12px_-2px_hsl(var(--primary)/0.3)] transition-all duration-300">
                                <img 
                                  src={`https://www.google.com/s2/favicons?domain=${source}&sz=64`}
                                  alt=""
                                  className="w-5 h-5 rounded"
                                  onError={(e) => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              </div>
                            </div>
                          )}
                          
                          <div className="space-y-2 flex-1 min-w-0">
                            <h4 className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors duration-200 line-clamp-2">
                              {article.title}
                            </h4>
                            <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
                              {article.description}
                            </p>
                            {source && (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[11px] text-muted-foreground/70 font-medium tracking-wide">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500/60 animate-pulse" />
                                {source}
                              </div>
                            )}
                          </div>
                          
                          <ExternalLink className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary/60 shrink-0 mt-1 transition-colors" />
                        </div>
                      </motion.a>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <div className="p-4 rounded-full bg-muted/20 border border-white/5">
                    <Search className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                  <p className="text-muted-foreground text-sm">Keine verwandten Artikel gefunden</p>
                </div>
              )}
            </TabsContent>

            {/* Media Tab - YouTube Search Links with futuristic design */}
            <TabsContent value="media" className="p-6 space-y-4 mt-0">
              {loadingArticles ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <motion.div
                    className="relative w-16 h-16"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  >
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-red-500 border-r-red-500/50" />
                    <div className="absolute inset-2 rounded-full border border-transparent border-b-pink-500/60" />
                    <Play className="absolute inset-0 m-auto w-6 h-6 text-red-500" />
                  </motion.div>
                  <p className="text-sm text-muted-foreground font-medium">Suche Videos...</p>
                </div>
              ) : videos.length > 0 ? (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                        <Play className="w-3 h-3" />
                        <span className="tracking-wider uppercase font-semibold">YouTube</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{videos.length} Suchanfragen</span>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {videos.map((video, idx) => (
                      <motion.a
                        key={idx}
                        href={video.search_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1, type: "spring", stiffness: 200 }}
                        className="group relative flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] bg-gradient-to-br from-red-500/[0.03] to-transparent backdrop-blur-sm hover:border-red-500/30 hover:shadow-[0_0_30px_-5px_rgba(239,68,68,0.15)] transition-all duration-300"
                      >
                        {/* Play button thumbnail */}
                        <div className="relative shrink-0 w-20 h-14 rounded-lg bg-gradient-to-br from-red-500/20 to-red-900/30 border border-red-500/10 flex items-center justify-center overflow-hidden group-hover:border-red-500/30 transition-all duration-300">
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          <motion.div 
                            className="relative z-10 w-8 h-8 rounded-full bg-red-600/90 flex items-center justify-center shadow-lg"
                            whileHover={{ scale: 1.1 }}
                          >
                            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                          </motion.div>
                          {/* Scanlines effect */}
                          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
                            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)'
                          }} />
                        </div>

                        <div className="flex-1 min-w-0 space-y-1.5">
                          <h5 className="font-semibold text-sm group-hover:text-red-400 transition-colors line-clamp-1">
                            {video.title}
                          </h5>
                          <p className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
                            <Search className="w-3 h-3" />
                            <span className="truncate">{video.query}</span>
                          </p>
                        </div>

                        <ExternalLink className="w-4 h-4 text-muted-foreground/30 group-hover:text-red-400/60 shrink-0 transition-colors" />
                      </motion.a>
                    ))}
                  </div>

                  {/* Direct search CTA */}
                  <motion.a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(trend?.name || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-white/10 text-sm text-muted-foreground hover:border-red-500/30 hover:text-red-400 transition-all"
                  >
                    <Search className="w-4 h-4" />
                    Alle Videos auf YouTube suchen
                    <ExternalLink className="w-3 h-3" />
                  </motion.a>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <div className="p-4 rounded-full bg-muted/20 border border-white/5">
                    <Video className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                  <p className="text-muted-foreground text-sm">Keine Videos gefunden</p>
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Footer with Actions */}
        <div className="p-4 border-t border-white/5 bg-muted/20 flex items-center justify-between gap-4">
          {/* Bookmark Date if saved */}
          {isBookmarked && bookmarkDate && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span>Gespeichert am {format(new Date(bookmarkDate), 'dd. MMM yyyy', { locale: de })}</span>
            </div>
          )}
          
          <div className="flex items-center gap-3 ml-auto">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-white/10"
            >
              Schließen
            </Button>
            
            <Button
              onClick={() => {
                onToggleBookmark(trend.id);
                toast({
                  title: isBookmarked ? "Trend entfernt" : "Trend gespeichert",
                  description: isBookmarked 
                    ? "Der Trend wurde aus deinen Gespeicherten entfernt" 
                    : "Der Trend wurde zu deinen Gespeicherten hinzugefügt",
                });
              }}
              className={`gap-2 ${
                isBookmarked 
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                  : 'bg-gradient-to-r from-primary to-primary/80 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.3)]'
              }`}
            >
              <AnimatePresence mode="wait">
                {isBookmarked ? (
                  <motion.div
                    key="saved"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="flex items-center gap-2"
                  >
                    <BookmarkCheck className="w-4 h-4" />
                    Gespeichert
                  </motion.div>
                ) : (
                  <motion.div
                    key="save"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="flex items-center gap-2"
                  >
                    <Bookmark className="w-4 h-4" />
                    Trend speichern
                  </motion.div>
                )}
              </AnimatePresence>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
