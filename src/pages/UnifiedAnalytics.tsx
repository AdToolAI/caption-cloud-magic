import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RefreshCw, Hash, TrendingUp, Award, DollarSign, FileText, Mail, Settings } from "lucide-react";
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
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [timeFilter, setTimeFilter] = useState<"7" | "30">("7");
  const [platform, setPlatform] = useState("instagram");
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [metricsUpdateKey, setMetricsUpdateKey] = useState(0);
  
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
          toast.success('Metriken automatisch aktualisiert');
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
      toast.error("Fehler beim Laden der Analytics-Daten");
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = () => {
    toast.info("Analytics werden aktualisiert...");
    fetchAnalytics();
  };

  const analyzeHashtags = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-hashtags', {
        body: { platform }
      });

      if (error) throw error;

      toast.success(`Hashtag-Analyse abgeschlossen: ${data.totalAnalyzed} Hashtags analysiert`);
      fetchAnalytics();
    } catch (error: any) {
      toast.error(`Fehler: ${error.message}`);
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

      toast.success(`Analyse abgeschlossen: ${data.analyzed} Posts analysiert`);
      fetchAnalytics();
    } catch (error: any) {
      toast.error(`Fehler: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold mb-2">{t('analytics.unified.title')}</h1>
            <p className="text-muted-foreground">
              Zuletzt aktualisiert: {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as "7" | "30")}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Tage</SelectItem>
                <SelectItem value="30">30 Tage</SelectItem>
              </SelectContent>
            </Select>
            
            <Dialog open={connectionsOpen} onOpenChange={setConnectionsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Plattformen verwalten
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Social-Media-Verbindungen</DialogTitle>
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
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">{t('analytics.unified.tabs.overview')}</TabsTrigger>
            <TabsTrigger value="performance">{t('analytics.unified.tabs.performance')}</TabsTrigger>
            <TabsTrigger value="top-content">{t('analytics.unified.tabs.topContent')}</TabsTrigger>
            <TabsTrigger value="hashtags">{t('analytics.unified.tabs.hashtags')}</TabsTrigger>
            <TabsTrigger value="campaigns">{t('analytics.unified.tabs.campaigns')}</TabsTrigger>
            <TabsTrigger value="reports">{t('analytics.unified.tabs.reports')}</TabsTrigger>
          </TabsList>

          {/* Übersicht Tab */}
          <TabsContent value="overview" className="space-y-6">
            <OverviewMetrics data={metricsSummary} loading={loading} />
            <MetricsChart data={metricsSummary} loading={loading} />
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Platform-spezifische Performance</CardTitle>
                <CardDescription>Detaillierte Metriken nach Plattform</CardDescription>
              </CardHeader>
              <CardContent>
                <OverviewTab key={`overview-${metricsUpdateKey}`} />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Engagement-Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <EngagementTrendsTab key={`trends-${metricsUpdateKey}`} />
              </CardContent>
            </Card>
            
            <MetricsChart data={metricsSummary} loading={loading} byProvider />
          </TabsContent>

          {/* Top Content Tab */}
          <TabsContent value="top-content" className="space-y-6">
            <TopPostsTable data={topPosts} loading={loading} />
            
            <Card>
              <CardHeader>
                <CardTitle>
                  <Award className="h-5 w-5 inline mr-2" />
                  Best Performing Content
                </CardTitle>
                <CardDescription>AI-identifizierte Top-Performer mit Insights</CardDescription>
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
                    Best Content identifizieren
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
                              {new Date(content.posted_at).toLocaleDateString()}
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
                <CardTitle>Caption-Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <CaptionInsightsTab key={`captions-${metricsUpdateKey}`} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Hashtags Tab */}
          <TabsContent value="hashtags" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Hash className="h-5 w-5 inline mr-2" />
                  Hashtag-Performance
                </CardTitle>
                <CardDescription>Analysiere deine Top-Hashtags nach Reichweite und Engagement</CardDescription>
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
                    Jetzt analysieren
                  </Button>
                </div>

                <div className="space-y-3">
                  {hashtagData.map((hashtag) => (
                    <div key={hashtag.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-semibold">{hashtag.hashtag}</p>
                        <p className="text-sm text-muted-foreground">
                          {hashtag.posts_count} Posts · {hashtag.total_reach} Reichweite
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {hashtag.avg_engagement_rate.toFixed(2)}% Engagement
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Kampagnen Tab */}
          <TabsContent value="campaigns" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  <DollarSign className="h-5 w-5 inline mr-2" />
                  Campaign ROI
                </CardTitle>
                <CardDescription>Verfolge die Performance deiner Marketing-Kampagnen</CardDescription>
              </CardHeader>
              <CardContent>
                {campaignROI.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Noch keine Kampagnen vorhanden
                  </p>
                ) : (
                  <div className="space-y-3">
                    {campaignROI.map((campaign) => (
                      <div key={campaign.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-semibold">{campaign.campaign_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(campaign.start_date).toLocaleDateString()} - 
                            {campaign.end_date ? new Date(campaign.end_date).toLocaleDateString() : 'Laufend'}
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

          {/* Berichte Tab */}
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
                  Geplante Reports
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
