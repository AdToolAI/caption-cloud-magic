import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { OverviewMetrics } from "@/components/analytics/OverviewMetrics";
import { MetricsChart } from "@/components/analytics/MetricsChart";
import { TopPostsTable } from "@/components/analytics/TopPostsTable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BestTimeHeatmap } from "@/components/dashboard/BestTimeHeatmap";

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

export default function Analytics() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [timeFilter, setTimeFilter] = useState<"7" | "30">("7");
  const [metricsSummary, setMetricsSummary] = useState<MetricsSummary[]>([]);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);

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
  }, [user, timeFilter]);

  const handleManualRefresh = () => {
    toast.info("Refreshing analytics...");
    fetchAnalytics();
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="platforms">Per Platform</TabsTrigger>
            <TabsTrigger value="top-posts">Top Posts</TabsTrigger>
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
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}
