import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VideoPerformance } from '@/hooks/useContentAnalytics';
import { TrendingUp, Eye, Clock, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  videos: VideoPerformance[];
}

export function VideoPerformanceMetrics({ videos }: Props) {
  const topVideos = videos.slice(0, 10);
  
  const chartData = topVideos.map(v => ({
    name: v.title.substring(0, 20),
    views: v.views,
    engagement: v.engagement_rate
  }));

  const avgMetrics = {
    views: videos.reduce((sum, v) => sum + v.views, 0) / videos.length,
    engagement: videos.reduce((sum, v) => sum + v.engagement_rate, 0) / videos.length,
    watchTime: videos.reduce((sum, v) => sum + v.avg_watch_time, 0) / videos.length,
    conversion: videos.reduce((sum, v) => sum + v.conversion_rate, 0) / videos.length
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Eye className="h-4 w-4" />
            Durchschn. Views
          </div>
          <p className="text-2xl font-bold">{avgMetrics.views.toLocaleString('de-DE', { maximumFractionDigits: 0 })}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <TrendingUp className="h-4 w-4" />
            Engagement Rate
          </div>
          <p className="text-2xl font-bold">{avgMetrics.engagement.toFixed(1)}%</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Clock className="h-4 w-4" />
            Watch Time
          </div>
          <p className="text-2xl font-bold">{avgMetrics.watchTime.toFixed(0)}s</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Target className="h-4 w-4" />
            Conversion Rate
          </div>
          <p className="text-2xl font-bold">{avgMetrics.conversion.toFixed(1)}%</p>
        </Card>
      </div>

      {/* Performance Chart */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Top 10 Videos - Views & Engagement</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Bar yAxisId="left" dataKey="views" fill="hsl(var(--primary))" name="Views" />
            <Bar yAxisId="right" dataKey="engagement" fill="hsl(var(--accent))" name="Engagement %" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Top Videos Table */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Top Performing Videos</h3>
        <div className="space-y-3">
          {topVideos.map((video, idx) => (
            <div key={video.video_id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-sm">
                {idx + 1}
              </div>
              
              {video.thumbnail_url && (
                <img src={video.thumbnail_url} alt="" className="w-16 h-10 object-cover rounded" />
              )}
              
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{video.title}</p>
                <p className="text-sm text-muted-foreground">Template: {video.template_name}</p>
              </div>

              <div className="flex gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Views</p>
                  <p className="font-semibold">{video.views.toLocaleString('de-DE')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Engagement</p>
                  <p className="font-semibold">{video.engagement_rate.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Conversion</p>
                  <p className="font-semibold">{video.conversion_rate.toFixed(1)}%</p>
                </div>
              </div>

              <Badge variant={video.engagement_rate > 10 ? "default" : "secondary"}>
                {video.engagement_rate > 10 ? "High Performer" : "Standard"}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
