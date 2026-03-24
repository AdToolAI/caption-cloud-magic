import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, Zap, Calendar, Trophy } from "lucide-react";

interface Metrics {
  totalPosts: number;
  
  postsThisWeek: number;
  weekOverWeekGrowth: number;
  goalsCompleted: number;
  avgEngagementRate: number;
  topPerformingPlatform: string;
  streakDays: number;
}

export const AnalyticsDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<Metrics>({
    totalPosts: 0,
    totalHooks: 0,
    postsThisWeek: 0,
    weekOverWeekGrowth: 0,
    goalsCompleted: 0,
    avgEngagementRate: 0,
    topPerformingPlatform: "Instagram",
    streakDays: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadMetrics();
    }
  }, [user]);

  const loadMetrics = async () => {
    if (!user) return;

    try {
      // Get total posts
      const { count: totalPosts } = await supabase
        .from("captions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      // Get this week's posts
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { count: postsThisWeek } = await supabase
        .from("captions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", weekAgo.toISOString());

      // Get completed goals
      const { count: goalsCompleted } = await supabase
        .from("social_goals")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "completed");

      // Calculate week-over-week growth
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const { count: postsLastWeek } = await supabase
        .from("captions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", twoWeeksAgo.toISOString())
        .lt("created_at", weekAgo.toISOString());

      const growth = postsLastWeek 
        ? Math.round(((postsThisWeek || 0) - postsLastWeek) / postsLastWeek * 100)
        : 0;

      // Get average engagement from performance data
      const { data: performanceData } = await supabase
        .from("post_metrics")
        .select("engagement_rate")
        .eq("user_id", user.id)
        .not("engagement_rate", "is", null);

      const avgEngagement = performanceData && performanceData.length > 0
        ? performanceData.reduce((acc, curr) => acc + (curr.engagement_rate || 0), 0) / performanceData.length
        : 0;

      // Calculate streak (simplified - last 7 days activity)
      const { data: recentActivity } = await supabase
        .from("app_events")
        .select("occurred_at")
        .eq("user_id", user.id)
        .gte("occurred_at", weekAgo.toISOString())
        .order("occurred_at", { ascending: false });

      const streak = recentActivity ? Math.min(recentActivity.length, 7) : 0;

      setMetrics({
        totalPosts: totalPosts || 0,
        totalHooks: totalHooks || 0,
        postsThisWeek: postsThisWeek || 0,
        weekOverWeekGrowth: growth,
        goalsCompleted: goalsCompleted || 0,
        avgEngagementRate: Math.round(avgEngagement * 10) / 10,
        topPerformingPlatform: "Instagram",
        streakDays: streak,
      });
    } catch (error) {
      console.error("Error loading metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: t("analytics.totalContent"),
      value: metrics.totalPosts + metrics.totalHooks,
      icon: Zap,
      description: t("analytics.totalContentDesc"),
      color: "text-primary"
    },
    {
      title: t("analytics.thisWeek"),
      value: metrics.postsThisWeek,
      icon: metrics.weekOverWeekGrowth >= 0 ? TrendingUp : TrendingDown,
      description: `${metrics.weekOverWeekGrowth >= 0 ? "+" : ""}${metrics.weekOverWeekGrowth}% ${t("analytics.vsLastWeek")}`,
      color: metrics.weekOverWeekGrowth >= 0 ? "text-success" : "text-warning"
    },
    {
      title: t("analytics.goalsAchieved"),
      value: metrics.goalsCompleted,
      icon: Trophy,
      description: t("analytics.goalsAchievedDesc"),
      color: "text-accent"
    },
    {
      title: t("analytics.streak"),
      value: `${metrics.streakDays} ${t("analytics.days")}`,
      icon: Calendar,
      description: t("analytics.streakDesc"),
      color: "text-warning"
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-3">
              <div className="h-4 bg-muted rounded w-2/3"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-muted rounded w-3/4"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <Card key={index} className="hover:shadow-lg transition-all">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-1">{stat.value}</div>
              <CardDescription className="text-xs">{stat.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      {metrics.avgEngagementRate > 0 && (
        <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {t("analytics.performanceInsight")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg">
              {t("analytics.engagementRateMessage", { 
                rate: metrics.avgEngagementRate.toString(),
                platform: metrics.topPerformingPlatform 
              })}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
