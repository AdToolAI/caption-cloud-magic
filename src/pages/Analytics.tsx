import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, Hash, Award, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { OverviewMetrics } from "@/components/analytics/OverviewMetrics";
import { MetricsChart } from "@/components/analytics/MetricsChart";
import { TopPostsTable } from "@/components/analytics/TopPostsTable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BestTimeHeatmap } from "@/components/dashboard/BestTimeHeatmap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [heatmapPosts, setHeatmapPosts] = useState<Record<string, number[][]>>({});
  const [heatmapVideos, setHeatmapVideos] = useState<Record<string, number[][]>>({});
  const [heatmapSource, setHeatmapSource] = useState<'real' | 'heuristic'>('heuristic');
  const [postCount, setPostCount] = useState(0);

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

      // Fetch heatmap data
      const { data: heatmapResult } = await supabase.functions.invoke('analyze-heatmap-data', {
        body: { 
          platforms: ['instagram', 'tiktok', 'linkedin', 'youtube', 'facebook', 'x']
        }
      });
      
      if (heatmapResult) {
        setHeatmapPosts(heatmapResult.heatmap_posts);
        setHeatmapVideos(heatmapResult.heatmap_videos);
        setHeatmapSource(heatmapResult.data_source);
        setPostCount(heatmapResult.post_count);
      }

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
    toast.info("Refreshing analytics...");
    fetchAnalytics();
  };

  const analyzeHashtags = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-hashtags', {
        body: { platform }
      });

      if (error) throw error;

      toast.success(`${data.totalAnalyzed} hashtags analyzed successfully`);
      fetchAnalytics();
    } catch (error: any) {
      toast.error(error.message || "Failed to analyze hashtags");
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

      toast.success(`${data.analyzed} posts analyzed successfully`);
      fetchAnalytics();
    } catch (error: any) {
      toast.error(error.message || "Failed to identify best content");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold mb-2">Analytics Dashboard</h1>
            <p className="text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="x">X</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as "7" | "30")}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Days</SelectItem>
                <SelectItem value="30">30 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleManualRefresh} variant="outline" size="icon">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="platforms">Per Platform</TabsTrigger>
            <TabsTrigger value="top-posts">Top Posts</TabsTrigger>
            <TabsTrigger value="hashtags">
              <Hash className="h-4 w-4 mr-2" />
              Hashtags
            </TabsTrigger>
            <TabsTrigger value="best-content">
              <Award className="h-4 w-4 mr-2" />
              Best Content
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <OverviewMetrics data={metricsSummary} loading={loading} />
            <MetricsChart data={metricsSummary} loading={loading} />
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            <BestTimeHeatmap 
              heatmap={heatmapPosts} 
              loading={loading}
              dataSource={heatmapSource}
              postCount={postCount}
            />
          </TabsContent>

          <TabsContent value="platforms" className="space-y-6">
            <MetricsChart data={metricsSummary} loading={loading} byProvider />
          </TabsContent>

          <TabsContent value="top-posts">
            <TopPostsTable data={topPosts} loading={loading} />
          </TabsContent>

          <TabsContent value="hashtags" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Hashtag Performance</CardTitle>
                <CardDescription>
                  Track which hashtags drive the most engagement for your content
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={analyzeHashtags} disabled={analyzing || loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${analyzing ? "animate-spin" : ""}`} />
                  Analyze Now
                </Button>

                <div className="space-y-3">
                  {hashtagData.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      No hashtag data yet. Click "Analyze Now" to start tracking.
                    </p>
                  ) : (
                    hashtagData.map((hashtag) => (
                      <div key={hashtag.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <p className="font-semibold">{hashtag.hashtag}</p>
                          <p className="text-sm text-muted-foreground">
                            {hashtag.posts_count} posts · {hashtag.total_reach.toLocaleString()} reach
                          </p>
                        </div>
                        <Badge variant="secondary">
                          {hashtag.avg_engagement_rate.toFixed(2)}% engagement
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="best-content" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Performing Content</CardTitle>
                <CardDescription>
                  Identify your highest-engagement posts with AI-powered insights
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={identifyBestContent} disabled={analyzing || loading}>
                  <TrendingUp className={`h-4 w-4 mr-2 ${analyzing ? "animate-spin" : ""}`} />
                  Identify Best
                </Button>

                <div className="space-y-4">
                  {bestContent.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      No analysis yet. Click "Identify Best" to discover your top content.
                    </p>
                  ) : (
                    bestContent.map((content) => (
                      <Card key={content.id}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm line-clamp-2">{content.caption_text}</p>
                              <p className="text-xs text-muted-foreground mt-2">
                                {new Date(content.posted_at).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge>{content.engagement_score} score</Badge>
                          </div>
                        </CardHeader>
                        {content.insights_json && content.insights_json.strengths && (
                          <CardContent>
                            <div className="flex gap-2 flex-wrap">
                              {content.insights_json.strengths.map((strength: string, idx: number) => (
                                <Badge key={idx} variant="outline">{strength}</Badge>
                              ))}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}
