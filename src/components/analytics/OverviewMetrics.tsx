import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Eye, Target, FileText } from "lucide-react";

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

interface OverviewMetricsProps {
  data: MetricsSummary[];
  loading: boolean;
}

export const OverviewMetrics = ({ data, loading }: OverviewMetricsProps) => {
  const totalLikes = data.reduce((sum, item) => sum + (item.likes || 0), 0);
  const totalViews = data.reduce((sum, item) => sum + (item.views || 0), 0);
  const avgEngagement = data.length > 0
    ? (data.reduce((sum, item) => sum + (item.avg_engagement || 0), 0) / data.length)
    : 0;
  const totalPosts = new Set(data.map(item => item.provider)).size;

  const metrics = [
    {
      title: "Total Likes",
      value: totalLikes.toLocaleString(),
      icon: TrendingUp,
      description: "Last 7 days",
      color: "text-primary"
    },
    {
      title: "Total Views",
      value: totalViews.toLocaleString(),
      icon: Eye,
      description: "Across all platforms",
      color: "text-blue-500"
    },
    {
      title: "Avg Engagement Rate",
      value: `${avgEngagement.toFixed(2)}%`,
      icon: Target,
      description: "Engagement percentage",
      color: "text-green-500"
    },
    {
      title: "Posts Tracked",
      value: totalPosts.toString(),
      icon: FileText,
      description: "Active platforms",
      color: "text-purple-500"
    }
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metrics.map((metric, index) => (
        <Card key={index} className="hover:shadow-lg transition-all">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.title}
              </CardTitle>
              <metric.icon className={`h-5 w-5 ${metric.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-1">{metric.value}</div>
            <p className="text-xs text-muted-foreground">{metric.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
