import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  Calendar, 
  CheckCircle, 
  Clock, 
  Users, 
  Target,
  ThumbsUp,
  Share2,
  Eye,
  Heart
} from "lucide-react";

export function AdvancedCalendarAnalytics() {
  const basicStats = [
    { label: "Total Posts", value: "42", change: "+12%", icon: Calendar },
    { label: "Published", value: "28", change: "+8%", icon: CheckCircle },
    { label: "Scheduled", value: "14", change: "+4", icon: Clock },
    { label: "Avg. Engagement", value: "2.4K", change: "+15%", icon: TrendingUp },
  ];

  const advancedStats = [
    { label: "Total Reach", value: "125K", change: "+23%", icon: Eye, trend: "up" },
    { label: "Engagement Rate", value: "4.8%", change: "+0.8%", icon: ThumbsUp, trend: "up" },
    { label: "Shares", value: "1.2K", change: "+18%", icon: Share2, trend: "up" },
    { label: "Likes", value: "5.6K", change: "+25%", icon: Heart, trend: "up" },
    { label: "Audience Growth", value: "+2.4K", change: "+12%", icon: Users, trend: "up" },
    { label: "Goal Progress", value: "78%", change: "+8%", icon: Target, trend: "up" },
  ];

  return (
    <div className="space-y-6">
      {/* Basic Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {basicStats.map((stat, idx) => (
          <Card key={idx} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <stat.icon className="h-5 w-5 text-muted-foreground" />
              <Badge variant="secondary" className="text-xs">{stat.change}</Badge>
            </div>
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </Card>
        ))}
      </div>

      {/* Advanced Stats - Only visible with feature flag */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Advanced Metrics</h3>
          <Badge variant="default" className="text-xs">New</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {advancedStats.map((stat, idx) => (
            <Card key={idx} className="p-4 border-primary/20 bg-primary/5">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className="h-5 w-5 text-primary" />
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs">{stat.change}</Badge>
                  {stat.trend === "up" && (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  )}
                </div>
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Performance Insights */}
      <Card className="p-4 bg-gradient-to-r from-primary/10 to-purple-500/10">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h4 className="font-semibold">Performance Insights</h4>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between p-2 bg-background/50 rounded">
              <span className="text-sm">Best posting time</span>
              <Badge>18:00 - 20:00 Uhr</Badge>
            </div>
            <div className="flex items-center justify-between p-2 bg-background/50 rounded">
              <span className="text-sm">Top performing platform</span>
              <Badge>Instagram</Badge>
            </div>
            <div className="flex items-center justify-between p-2 bg-background/50 rounded">
              <span className="text-sm">Most engaging content type</span>
              <Badge>Reels</Badge>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
