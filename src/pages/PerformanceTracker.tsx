import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Footer } from "@/components/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OverviewTab } from "@/components/performance/OverviewTab";
import { EngagementTrendsTab } from "@/components/performance/EngagementTrendsTab";
import { CaptionInsightsTab } from "@/components/performance/CaptionInsightsTab";
import { ConnectionsTab } from "@/components/performance/ConnectionsTab";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PerformanceTracker = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("overview");
  const [metricsUpdateKey, setMetricsUpdateKey] = useState(0);

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
          toast.success('Metrics updated automatically');
          // Trigger re-fetch by updating key
          setMetricsUpdateKey(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{t('performance.title')}</h1>
          <p className="text-muted-foreground">{t('performance.subtitle')}</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="overview">{t('performance.tabs.overview')}</TabsTrigger>
            <TabsTrigger value="trends">{t('performance.tabs.trends')}</TabsTrigger>
            <TabsTrigger value="insights">{t('performance.tabs.insights')}</TabsTrigger>
            <TabsTrigger value="connections">{t('performance.tabs.connections')}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab key={`overview-${metricsUpdateKey}`} />
          </TabsContent>

          <TabsContent value="trends">
            <EngagementTrendsTab key={`trends-${metricsUpdateKey}`} />
          </TabsContent>

          <TabsContent value="insights">
            <CaptionInsightsTab key={`captions-${metricsUpdateKey}`} />
          </TabsContent>

          <TabsContent value="connections">
            <ConnectionsTab />
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
};

export default PerformanceTracker;