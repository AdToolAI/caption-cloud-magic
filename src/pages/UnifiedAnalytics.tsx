import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Footer } from "@/components/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RefreshCw, Hash, TrendingUp, Award, DollarSign, FileText, Mail, Settings, Brain, MessageSquare, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

// Import components from existing pages
import { OverviewMetrics } from "@/components/analytics/OverviewMetrics";
import { MetricsChart } from "@/components/analytics/MetricsChart";
import { TopPostsTable } from "@/components/analytics/TopPostsTable";
import { OverviewTab } from "@/components/performance/OverviewTab";
import { EngagementTrendsTab } from "@/components/performance/EngagementTrendsTab";
import { CaptionInsightsTab } from "@/components/performance/CaptionInsightsTab";
import { ConnectionsTab } from "@/components/performance/ConnectionsTab";
import { ReportBuilder } from "@/components/analytics/ReportBuilder";
import { ScheduledReports } from "@/components/analytics/ScheduledReports";
import { PlatformOverviewCards } from "@/components/analytics/PlatformOverviewCards";
import { AIStrategyPanel } from "@/components/analytics/AIStrategyPanel";
import { CommentsAnalyticsTab } from "@/components/analytics/CommentsAnalyticsTab";

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

export default function UnifiedAnalytics() {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [timeFilter, setTimeFilter] = useState<"7" | "30">("7");
  const [platform, setPlatform] = useState("instagram");
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [metricsUpdateKey, setMetricsUpdateKey] = useState(0);
  
  const locale = language === 'de' ? 'de-DE' : language === 'es' ? 'es-ES' : 'en-US';
  
  // Analytics data
  const [metricsSummary, setMetricsSummary] = useState<MetricsSummary[]>([]);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [hashtagData, setHashtagData] = useState<any[]>([]);
  const [bestContent, setBestContent] = useState<any[]>([]);
  const [campaignROI, setCampaignROI] = useState<any[]>([]);

  useEffect(() => {
    // Subscribe to real-time updates on post_metrics table
    const channel = supabase
      .channel('post_metrics_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_metrics'
        },
        (payload) => {
          console.log('Real-time metrics update:', payload);
          toast.success(t('analytics.unified.metricsAutoUpdated'));
          setMetricsUpdateKey(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (user) {
      fetchAnalytics();
      
      // Auto-refresh every 60 seconds
      const interval = setInterval(fetchAnalytics, 60000);
      return () => clearInterval(interval);
    }
  }, [user, timeFilter, platform]);

  const fetchAnalytics = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const daysAgo = parseInt(timeFilter);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

      // Fetch metrics summary
      const { data: summaryData, error: summaryError } = await supabase
        .from("v_metrics_summary")
        .select("*")
        .gte("day", cutoffDate.toISOString())
        .order("day", { ascending: true });

      if (summaryError) throw summaryError;
      setMetricsSummary(summaryData || []);

      // Fetch top posts
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

      // Fetch campaign ROI
      const { data: roi } = await supabase
        .from('campaign_roi')
        .select('*')
        .eq('platform', platform)
        .order('created_at', { ascending: false });
      
      setCampaignROI(roi || []);

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast.error(t('analytics.unified.errorLoadingAnalytics'));
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = () => {
    toast.info(t('analytics.unified.analyticsRefreshing'));
    fetchAnalytics();
  };

  const analyzeHashtags = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-hashtags', {
        body: { platform }
      });

      if (error) throw error;

      toast.success(t('analytics.unified.hashtagAnalysisDone', { count: data.totalAnalyzed }));
      fetchAnalytics();
    } catch (error: any) {
      toast.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const identifyBestContent = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('identify-best-content', {
        body: { platform, limit: 10 }
      });

      if (error) throw error;

      toast.success(t('analytics.unified.analysisDone', { count: data.analyzed }));
      fetchAnalytics();
    } catch (error: any) {
      toast.error(`${t('common.error')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold mb-2">{t('analytics.unified.title')}</h1>
            <p className="text-muted-foreground">
              {t('analytics.unified.lastUpdated')}: {lastUpdated.toLocaleTimeString(locale)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as "7" | "30")}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('analytics.unified.days7')}</SelectItem>
                <SelectItem value="30">{t('analytics.unified.days30')}</SelectItem>
              </SelectContent>
            </Select>
            
            <Dialog open={connectionsOpen} onOpenChange={setConnectionsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  {t('analytics.unified.managePlatforms')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t('analytics.unified.socialConnections')}</DialogTitle>
                </DialogHeader>
                <ConnectionsTab />
              </DialogContent>
            </Dialog>

            <Button onClick={handleManualRefresh} variant="outline" size="icon">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-9">
            <TabsTrigger value="overview">{t('analytics.unified.tabs.overview')}</TabsTrigger>
            <TabsTrigger value="platforms">
              <LayoutGrid className="h-3.5 w-3.5 mr-1" />
              {t('analytics.unified.tabs.platforms')}
            </TabsTrigger>
            <TabsTrigger value="performance">{t('analytics.unified.tabs.performance')}</TabsTrigger>
            <TabsTrigger value="top-content">{t('analytics.unified.tabs.topContent')}</TabsTrigger>
            <TabsTrigger value="hashtags">{t('analytics.unified.tabs.hashtags')}</TabsTrigger>
            <TabsTrigger value="campaigns">{t('analytics.unified.tabs.campaigns')}</TabsTrigger>
            <TabsTrigger value="ai-strategy">
              <Brain className="h-3.5 w-3.5 mr-1" />
              {t('analytics.unified.tabs.aiStrategy')}
            </TabsTrigger>
            <TabsTrigger value="comments">
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              {t('analytics.unified.tabs.comments')}
            </TabsTrigger>
            <TabsTrigger value="reports">{t('analytics.unified.tabs.reports')}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <OverviewMetrics data={metricsSummary} loading={loading} />
            <MetricsChart data={metricsSummary} loading={loading} />
          </TabsContent>

          <TabsContent value="platforms" className="space-y-6">
            <PlatformOverviewCards />
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('analytics.unified.platformPerformance')}</CardTitle>
                <CardDescription>{t('analytics.unified.detailedMetrics')}</CardDescription>
              </CardHeader>
              <CardContent>
                <OverviewTab key={`overview-${metricsUpdateKey}`} />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>{t('analytics.unified.engagementTrends')}</CardTitle>
              </CardHeader>
              <CardContent>
                <EngagementTrendsTab key={`trends-${metricsUpdateKey}`} />
              </CardContent>
            </Card>
            
            <MetricsChart data={metricsSummary} loading={loading} byProvider />
          </TabsContent>

          <TabsContent value="top-content" className="space-y-6">
            <TopPostsTable data={topPosts} loading={loading} />
            
            <Card>
              <CardHeader>
                <CardTitle>
                  <Award className="h-5 w-5 inline mr-2" />
                  {t('analytics.unified.bestPerformingContent')}
                </CardTitle>
                <CardDescription>{t('analytics.unified.aiIdentifiedTopPerformers')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="x">X</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={identifyBestContent} disabled={loading}>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    {t('analytics.unified.identifyBestContent')}
                  </Button>
                </div>

                <div className="space-y-4">
                  {bestContent.map((content) => (
                    <Card key={content.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm line-clamp-2">{content.caption_text}</p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(content.posted_at).toLocaleDateString(locale)}
                            </p>
                          </div>
                          <Badge>{content.engagement_score} Score</Badge>
                        </div>
                      </CardHeader>
                      {content.insights_json && (
                        <CardContent>
                          <div className="flex gap-2 flex-wrap">
                            {content.insights_json.strengths?.map((strength: string, idx: number) => (
                              <Badge key={idx} variant="outline">{strength}</Badge>
                            ))}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('analytics.unified.captionInsights')}</CardTitle>
              </CardHeader>
              <CardContent>
                <CaptionInsightsTab key={`captions-${metricsUpdateKey}`} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hashtags" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Hash className="h-5 w-5 inline mr-2" />
                  {t('analytics.unified.hashtagPerformanceTitle')}
                </CardTitle>
                <CardDescription>{t('analytics.unified.hashtagPerformanceDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="x">X</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={analyzeHashtags} disabled={loading}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('analytics.unified.analyzeNow')}
                  </Button>
                </div>

                <div className="space-y-3">
                  {hashtagData.map((hashtag) => (
                    <div key={hashtag.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-semibold">{hashtag.hashtag}</p>
                        <p className="text-sm text-muted-foreground">
                          {hashtag.posts_count} Posts · {hashtag.total_reach} {t('analytics.unified.reachLabel')}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {hashtag.avg_engagement_rate.toFixed(2)}% {t('analytics.unified.engagementLabel')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="campaigns" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  <DollarSign className="h-5 w-5 inline mr-2" />
                  {t('analytics.unified.campaignROI')}
                </CardTitle>
                <CardDescription>{t('analytics.unified.campaignROIDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {campaignROI.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    {t('analytics.unified.noCampaigns')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {campaignROI.map((campaign) => (
                      <div key={campaign.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-semibold">{campaign.campaign_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(campaign.start_date).toLocaleDateString(locale)} - 
                            {campaign.end_date ? new Date(campaign.end_date).toLocaleDateString(locale) : t('analytics.unified.ongoing')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">
                            {campaign.roi_percent ? `${campaign.roi_percent}%` : 'N/A'}
                          </p>
                          <p className="text-sm text-muted-foreground">ROI</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai-strategy" className="space-y-6">
            <AIStrategyPanel />
          </TabsContent>

          <TabsContent value="comments" className="space-y-6">
            <CommentsAnalyticsTab />
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  <FileText className="h-5 w-5 inline mr-2" />
                  Report Builder
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ReportBuilder />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <Mail className="h-5 w-5 inline mr-2" />
                  {t('analytics.unified.scheduledReports')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScheduledReports />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}
