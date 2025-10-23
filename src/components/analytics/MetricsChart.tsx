import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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

interface MetricsChartProps {
  data: MetricsSummary[];
  loading: boolean;
  byProvider?: boolean;
}

export const MetricsChart = ({ data, loading, byProvider = false }: MetricsChartProps) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-6 bg-muted rounded w-1/3 mb-2"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] bg-muted rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (byProvider) {
    // Group by provider
    const providerData = data.reduce((acc, item) => {
      const existing = acc.find(p => p.provider === item.provider);
      if (existing) {
        existing.likes += item.likes || 0;
        existing.views += item.views || 0;
        existing.engagement += item.avg_engagement || 0;
        existing.count += 1;
      } else {
        acc.push({
          provider: item.provider,
          likes: item.likes || 0,
          views: item.views || 0,
          engagement: item.avg_engagement || 0,
          count: 1
        });
      }
      return acc;
    }, [] as any[]);

    // Calculate averages
    providerData.forEach(p => {
      p.avgEngagement = p.count > 0 ? (p.engagement / p.count).toFixed(2) : 0;
    });

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Engagement by Platform</CardTitle>
            <CardDescription>Average engagement rate per provider</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={providerData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="provider" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend />
                <Bar dataKey="avgEngagement" fill="hsl(var(--primary))" name="Engagement Rate %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Engagement by Platform</CardTitle>
            <CardDescription>Likes and views per provider</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={providerData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="provider" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend />
                <Bar dataKey="likes" fill="hsl(var(--primary))" name="Likes" />
                <Bar dataKey="views" fill="hsl(var(--accent))" name="Views" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Time series data (group by day)
  const timeSeriesData = data.reduce((acc, item) => {
    const day = new Date(item.day).toLocaleDateString();
    const existing = acc.find(d => d.day === day);
    if (existing) {
      existing.likes += item.likes || 0;
      existing.views += item.views || 0;
    } else {
      acc.push({
        day,
        likes: item.likes || 0,
        views: item.views || 0
      });
    }
    return acc;
  }, [] as any[]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Engagement Over Time</CardTitle>
          <CardDescription>Views and likes trends (last 7 days)</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="day" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend />
              <Line type="monotone" dataKey="views" stroke="hsl(var(--primary))" name="Views" strokeWidth={2} />
              <Line type="monotone" dataKey="likes" stroke="hsl(var(--accent))" name="Likes" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily Activity</CardTitle>
          <CardDescription>Engagement distribution by day</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="day" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend />
              <Bar dataKey="likes" fill="hsl(var(--primary))" name="Likes" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};
