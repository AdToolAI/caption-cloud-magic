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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useEffect } from "react";

export default function AdminAnalytics() {
  const { metrics, loading, error, refetch, autoRefresh, setAutoRefresh, lastRefresh } = usePostHogMetrics();

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
          <Button onClick={refetch}>Retry</Button>
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
          <Button onClick={refetch} variant="outline" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh Now"}
          </Button>
        </div>
      </div>

      {/* Key Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <SignupConversionFunnel data={metrics?.signupFunnel} />
        </TabsContent>

        <TabsContent value="onboarding">
          <OnboardingMetrics data={metrics?.onboardingMetrics} />
        </TabsContent>

        <TabsContent value="upgrade">
          <UpgradeFunnel data={metrics?.upgradeFunnel} />
        </TabsContent>

        <TabsContent value="retention">
          <RetentionDashboard data={metrics?.retentionMetrics} />
        </TabsContent>

        <TabsContent value="live">
          <LiveEventStream events={metrics?.recentEvents || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
