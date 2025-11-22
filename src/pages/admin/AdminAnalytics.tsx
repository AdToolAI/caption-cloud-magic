import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard } from "@/components/ui/MetricCard";
import { usePostHogMetrics } from "@/hooks/usePostHogMetrics";
import { Loader2, TrendingUp, Users, Zap, DollarSign, RefreshCw } from "lucide-react";
import { SignupConversionFunnel } from "@/components/analytics/SignupConversionFunnel";
import { OnboardingMetrics } from "@/components/analytics/OnboardingMetrics";
import { UpgradeFunnel } from "@/components/analytics/UpgradeFunnel";
import { RetentionDashboard } from "@/components/analytics/RetentionDashboard";
import { LiveEventStream } from "@/components/analytics/LiveEventStream";
import { DateRangeSelector } from "@/components/analytics/DateRangeSelector";
import { AnalyticsExportButton } from "@/components/analytics/AnalyticsExportButton";
import { AnalyticsFilters } from "@/components/analytics/AnalyticsFilters";
import { KpiCardSkeleton, ChartSkeleton, TableSkeleton } from "@/components/ui/DataSkeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useEffect } from "react";

export default function AdminAnalytics() {
  const { metrics, loading, loadingDetailed, error, refetch, autoRefresh, setAutoRefresh, lastRefresh, dateRange, compareEnabled, updateDateRange, filters, updateFilters } = usePostHogMetrics();

  // Show toast when auto-refresh updates data
  useEffect(() => {
    if (autoRefresh && !loading && metrics) {
      toast.success("Dashboard updated", {
        description: "Latest data loaded successfully"
      });
    }
  }, [lastRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-6 border-destructive">
          <h2 className="text-lg font-semibold text-destructive mb-2">Analytics Error</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold font-heading mb-2">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Real-time insights from PostHog • Last update: {formatDistanceToNow(lastRefresh, { addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AnalyticsExportButton 
            metrics={metrics} 
            dateRange={dateRange} 
            compareEnabled={compareEnabled}
          />
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? "default" : "outline"}
            className="gap-2"
          >
            <div className={autoRefresh ? "animate-pulse" : ""}>
              <RefreshCw className="h-4 w-4" />
            </div>
            Auto-Refresh
            {autoRefresh && <Badge variant="secondary" className="ml-1">30s</Badge>}
          </Button>
          <Button 
            onClick={() => refetch(dateRange, compareEnabled, filters, true)} 
            variant="outline" 
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh Now
          </Button>
          
          {metrics && '_cached' in metrics && (
            <Badge variant={(metrics as any)._cached ? "default" : "secondary"} className="ml-2">
              {(metrics as any)._cached ? "Cache HIT (~150ms)" : "Cache MISS (~2.5s)"}
            </Badge>
          )}
        </div>
      </div>

      {/* Date Range Selector */}
      <Card className="p-4">
        <DateRangeSelector
          currentRange={dateRange}
          compareEnabled={compareEnabled}
          onRangeChange={updateDateRange}
        />
      </Card>

      {/* Filters */}
      <AnalyticsFilters 
        filters={filters}
        onFilterChange={updateFilters}
      />

      {/* Key Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </>
        ) : (
          <>
            <MetricCard
              label="Signup → First Post"
              value={`${metrics?.signupToPostRate || 0}%`}
              subtitle="Conversion Rate"
              icon={<TrendingUp className="h-5 w-5" />}
              trend={metrics?.signupToPostTrend}
            />
            <MetricCard
              label="Onboarding Completion"
              value={`${metrics?.onboardingCompletionRate || 0}%`}
              subtitle="Last 30 days"
              icon={<Users className="h-5 w-5" />}
              trend={metrics?.onboardingTrend}
            />
            <MetricCard
              label="Upgrade Conversion"
              value={`${metrics?.upgradeConversionRate || 0}%`}
              subtitle="Free → Paid"
              icon={<DollarSign className="h-5 w-5" />}
              trend={metrics?.upgradeTrend}
            />
            <MetricCard
              label="Active Users (30d)"
              value={metrics?.activeUsers || 0}
              subtitle="Monthly Active"
              icon={<Zap className="h-5 w-5" />}
            />
          </>
        )}
      </div>

      {/* Detailed Metrics Tabs */}
      <Tabs defaultValue="conversion" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="conversion">Signup Conversion</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="upgrade">Upgrade Funnel</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
          <TabsTrigger value="live">Live Events</TabsTrigger>
        </TabsList>

        <TabsContent value="conversion">
          {loadingDetailed ? (
            <ChartSkeleton />
          ) : (
            <SignupConversionFunnel data={metrics?.signupFunnel} />
          )}
        </TabsContent>

        <TabsContent value="onboarding">
          {loadingDetailed ? (
            <ChartSkeleton />
          ) : (
            <OnboardingMetrics data={metrics?.onboardingMetrics} />
          )}
        </TabsContent>

        <TabsContent value="upgrade">
          {loadingDetailed ? (
            <ChartSkeleton />
          ) : (
            <UpgradeFunnel data={metrics?.upgradeFunnel} />
          )}
        </TabsContent>

        <TabsContent value="retention">
          {loadingDetailed ? (
            <TableSkeleton rows={8} />
          ) : (
            <RetentionDashboard data={metrics?.retentionMetrics} />
          )}
        </TabsContent>

        <TabsContent value="live">
          {loadingDetailed ? (
            <TableSkeleton rows={10} />
          ) : (
            <LiveEventStream events={metrics?.recentEvents || []} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
