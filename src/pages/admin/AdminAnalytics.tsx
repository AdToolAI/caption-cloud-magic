import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard } from "@/components/ui/MetricCard";
import { usePostHogMetrics } from "@/hooks/usePostHogMetrics";
import { Loader2, TrendingUp, Users, Zap, DollarSign } from "lucide-react";
import { SignupConversionFunnel } from "@/components/analytics/SignupConversionFunnel";
import { OnboardingMetrics } from "@/components/analytics/OnboardingMetrics";
import { UpgradeFunnel } from "@/components/analytics/UpgradeFunnel";
import { Button } from "@/components/ui/button";

export default function AdminAnalytics() {
  const { metrics, loading, error, refetch } = usePostHogMetrics();

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
            Real-time insights from PostHog
          </p>
        </div>
        <Button onClick={refetch} variant="outline">
          Refresh Data
        </Button>
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="conversion">Signup Conversion</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="upgrade">Upgrade Funnel</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
