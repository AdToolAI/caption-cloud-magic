import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Footer } from "@/components/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, Hash, Award, TrendingUp, BarChart3, Globe, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { OverviewMetrics } from "@/components/analytics/OverviewMetrics";
import { MetricsChart } from "@/components/analytics/MetricsChart";
import { TopPostsTable } from "@/components/analytics/TopPostsTable";
import { AnalyticsHeroHeader } from "@/components/analytics/AnalyticsHeroHeader";
import { BestTimeHeatmap } from "@/components/dashboard/BestTimeHeatmap";
import { Badge } from "@/components/ui/badge";

interface MetricsSummary {
  provider: string;
  day: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  impressions: number;
  avg_engagement: number;
}

interface TopPost {
  provider: string;
  external_id: string;
  caption_text: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagement_rate: number;
  permalink: string;
  posted_at: string;
}

interface HashtagData {
  id: string;
  hashtag: string;
  posts_count: number;
  total_reach: number;
  avg_engagement_rate: number;
}

interface BestContent {
  id: string;
  caption_text: string;
  posted_at: string;
  engagement_score: number;
  insights_json?: any;
}

export default function Analytics() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [timeFilter, setTimeFilter] = useState<"7" | "30">("7");
  const [platform, setPlatform] = useState("instagram");
  const [metricsSummary, setMetricsSummary] = useState<MetricsSummary[]>([]);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [hashtagData, setHashtagData] = useState<HashtagData[]>([]);
  const [bestContent, setBestContent] = useState<BestContent[]>([]);

  const fetchAnalytics = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const daysAgo = parseInt(timeFilter);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

      // Fetch metrics summary with time filter
      const { data: summaryData, error: summaryError } = await supabase
        .from("v_metrics_summary")
        .select("*")
        .gte("day", cutoffDate.toISOString())
        .order("day", { ascending: true });

      if (summaryError) throw summaryError;
      setMetricsSummary(summaryData || []);

      // Fetch top posts with time filter
      const { data: topPostsData, error: topPostsError } = await supabase
        .from("v_top_posts")
        .select("*")
        .eq("user_id", user.id)
        .gte("posted_at", cutoffDate.toISOString());

      if (topPostsError) throw topPostsError;
      setTopPosts(topPostsData || []);

      // Fetch hashtag performance
      const { data: hashtags } = await supabase
        .from('hashtag_performance')
        .select('*')
        .eq('platform', platform)
        .order('avg_engagement_rate', { ascending: false })
        .limit(10);
      
      setHashtagData(hashtags || []);

      // Fetch best content
      const { data: best } = await supabase
        .from('best_content')
        .select('*')
        .eq('platform', platform)
        .order('engagement_score', { ascending: false })
        .limit(5);
      
      setBestContent(best || []);

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast.error("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchAnalytics();
      
      // Auto-refresh every 60 seconds
      const interval = setInterval(fetchAnalytics, 60000);
      return () => clearInterval(interval);
    }
  }, [user, timeFilter, platform]);

  const handleManualRefresh = () => {
    toast.info("Aktualisiere Analytics...");
    fetchAnalytics();
  };

  const analyzeHashtags = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-hashtags', {
        body: { platform }
      });

      if (error) throw error;

      toast.success(`${data.totalAnalyzed} Hashtags erfolgreich analysiert`);
      fetchAnalytics();
    } catch (error: any) {
      toast.error(error.message || "Hashtag-Analyse fehlgeschlagen");
    } finally {
      setAnalyzing(false);
    }
  };

  const identifyBestContent = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('identify-best-content', {
        body: { platform, limit: 10 }
      });

      if (error) throw error;

      toast.success(`${data.analyzed} Posts erfolgreich analysiert`);
      fetchAnalytics();
    } catch (error: any) {
      toast.error(error.message || "Content-Analyse fehlgeschlagen");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Hero Header */}
        <AnalyticsHeroHeader
          lastUpdated={lastUpdated}
          platform={platform}
          setPlatform={setPlatform}
          timeFilter={timeFilter}
          setTimeFilter={setTimeFilter}
          onRefresh={handleManualRefresh}
          loading={loading}
        />

        <Tabs defaultValue="overview" className="space-y-6">
          {/* Premium TabsList */}
          <TabsList className="w-full grid grid-cols-6 bg-muted/20 backdrop-blur-xl border border-white/10 
                               rounded-2xl p-2 h-auto gap-1">
            {[
              { value: "overview", label: "Overview", icon: BarChart3 },
              { value: "performance", label: "Performance", icon: TrendingUp },
              { value: "platforms", label: "Plattformen", icon: Globe },
              { value: "top-posts", label: "Top Posts", icon: Award },
              { value: "hashtags", label: "Hashtags", icon: Hash },
              { value: "best-content", label: "Best Content", icon: Sparkles }
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-muted-foreground
                           data-[state=active]:bg-primary/20 data-[state=active]:text-primary
                           data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)]
                           data-[state=active]:border data-[state=active]:border-primary/30
                           hover:text-foreground transition-all duration-300"
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden md:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <OverviewMetrics data={metricsSummary} loading={loading} />
            <MetricsChart data={metricsSummary} loading={loading} />
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            <BestTimeHeatmap heatmap={{}} loading={loading} />
          </TabsContent>

          <TabsContent value="platforms" className="space-y-6">
            <MetricsChart data={metricsSummary} loading={loading} byProvider />
          </TabsContent>

          <TabsContent value="top-posts">
            <TopPostsTable data={topPosts} loading={loading} />
          </TabsContent>

          <TabsContent value="hashtags" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10
                         shadow-[0_0_30px_hsla(43,90%,68%,0.08)]"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="w-12 h-12 rounded-xl flex items-center justify-center
                                bg-gradient-to-br from-primary/20 to-cyan-500/20
                                shadow-[0_0_20px_hsla(43,90%,68%,0.2)]"
                  >
                    <Hash className="h-6 w-6 text-primary" />
                  </motion.div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">Hashtag Performance</h3>
                    <p className="text-sm text-muted-foreground">Verfolge welche Hashtags am meisten Engagement bringen</p>
                  </div>
                </div>
                <Button 
                  onClick={analyzeHashtags} 
                  disabled={analyzing || loading}
                  className="bg-gradient-to-r from-primary to-primary/80
                             hover:shadow-[0_0_25px_hsla(43,90%,68%,0.3)] transition-all
                             relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent 
                                  -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <RefreshCw className={`h-4 w-4 mr-2 ${analyzing ? "animate-spin" : ""}`} />
                  Jetzt analysieren
                </Button>
              </div>

              {/* Hashtag Cards */}
              <div className="space-y-3">
                {hashtagData.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-12"
                  >
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 3, repeat: Infinity }}
                      className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center
                                  bg-gradient-to-br from-primary/20 to-cyan-500/20
                                  shadow-[0_0_25px_hsla(43,90%,68%,0.15)]"
                    >
                      <Hash className="h-8 w-8 text-primary/60" />
                    </motion.div>
                    <p className="text-muted-foreground">
                      Noch keine Hashtag-Daten. Klicke "Jetzt analysieren" um zu starten.
                    </p>
                  </motion.div>
                ) : (
                  hashtagData.map((hashtag, index) => (
                    <motion.div
                      key={hashtag.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ x: 4 }}
                      className="flex items-center justify-between p-4 rounded-xl 
                                 bg-muted/20 border border-white/10
                                 hover:border-primary/30 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.1)]
                                 transition-all duration-300"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center
                                        bg-primary/10 border border-primary/20">
                          <Hash className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{hashtag.hashtag}</p>
                          <p className="text-sm text-muted-foreground">
                            {hashtag.posts_count} Posts · {hashtag.total_reach.toLocaleString("de-DE")} Reach
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-primary/20 text-primary border border-primary/30
                                        shadow-[0_0_10px_hsla(43,90%,68%,0.15)]">
                        {hashtag.avg_engagement_rate.toFixed(2)}% Engagement
                      </Badge>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="best-content" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10
                         shadow-[0_0_30px_hsla(43,90%,68%,0.08)]"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-12 h-12 rounded-xl flex items-center justify-center
                                bg-gradient-to-br from-primary/20 to-purple-500/20
                                shadow-[0_0_20px_hsla(43,90%,68%,0.2)]"
                  >
                    <Sparkles className="h-6 w-6 text-primary" />
                  </motion.div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">Top Performing Content</h3>
                    <p className="text-sm text-muted-foreground">Identifiziere deine besten Posts mit KI-Insights</p>
                  </div>
                </div>
                <Button 
                  onClick={identifyBestContent} 
                  disabled={analyzing || loading}
                  className="bg-gradient-to-r from-primary to-primary/80
                             hover:shadow-[0_0_25px_hsla(43,90%,68%,0.3)] transition-all
                             relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent 
                                  -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <TrendingUp className={`h-4 w-4 mr-2 ${analyzing ? "animate-spin" : ""}`} />
                  Best identifizieren
                </Button>
              </div>

              {/* Content Cards */}
              <div className="space-y-4">
                {bestContent.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-12"
                  >
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 3, repeat: Infinity }}
                      className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center
                                  bg-gradient-to-br from-primary/20 to-purple-500/20
                                  shadow-[0_0_25px_hsla(43,90%,68%,0.15)]"
                    >
                      <Award className="h-8 w-8 text-primary/60" />
                    </motion.div>
                    <p className="text-muted-foreground">
                      Noch keine Analyse. Klicke "Best identifizieren" um deinen Top-Content zu entdecken.
                    </p>
                  </motion.div>
                ) : (
                  bestContent.map((content, index) => (
                    <motion.div
                      key={content.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ y: -2 }}
                      className="p-5 rounded-xl bg-muted/20 border border-white/10
                                 hover:border-primary/30 hover:shadow-[0_0_25px_hsla(43,90%,68%,0.1)]
                                 transition-all duration-300"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm text-foreground/80 line-clamp-2 mb-2">{content.caption_text}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(content.posted_at).toLocaleDateString("de-DE")}
                          </p>
                        </div>
                        <Badge className="bg-gradient-to-r from-primary/20 to-cyan-500/20 
                                          text-primary border border-primary/30
                                          shadow-[0_0_15px_hsla(43,90%,68%,0.2)]">
                          {content.engagement_score} Score
                        </Badge>
                      </div>
                      
                      {content.insights_json && content.insights_json.strengths && (
                        <div className="flex gap-2 flex-wrap mt-4 pt-4 border-t border-white/5">
                          {content.insights_json.strengths.map((strength: string, idx: number) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.2 + idx * 0.05 }}
                            >
                              <Badge 
                                variant="outline" 
                                className="bg-muted/30 border-white/20 text-foreground/70
                                           hover:border-primary/40 transition-colors"
                              >
                                {strength}
                              </Badge>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}
