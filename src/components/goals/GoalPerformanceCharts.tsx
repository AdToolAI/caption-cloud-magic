import { Card } from '@/components/ui/card';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTranslation } from '@/hooks/useTranslation';

interface PerformanceChartsProps {
  metrics: any[];
  timeframe: number;
}

export function GoalPerformanceCharts({ metrics, timeframe }: PerformanceChartsProps) {
  const { t } = useTranslation();

  // Prepare engagement trend data
  const engagementData = metrics
    .map(m => ({
      date: new Date(m.posted_at).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' }),
      rate: m.engagement_rate || 0,
    }))
    .reverse()
    .slice(-14); // Last 14 data points

  // Prepare platform comparison data
  const platformStats: Record<string, { posts: number; avgEngagement: number }> = {};
  
  metrics.forEach(m => {
    const platform = m.provider || 'unknown';
    if (!platformStats[platform]) {
      platformStats[platform] = { posts: 0, avgEngagement: 0 };
    }
    platformStats[platform].posts++;
    platformStats[platform].avgEngagement += m.engagement_rate || 0;
  });

  const platformData = Object.entries(platformStats).map(([platform, stats]) => ({
    platform: platform.charAt(0).toUpperCase() + platform.slice(1),
    posts: stats.posts,
    avgEngagement: parseFloat((stats.avgEngagement / stats.posts).toFixed(2)),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Engagement Trend */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 text-foreground">
          📈 {t('goals.charts.engagementTrend')}
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={engagementData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="date" 
              stroke="hsl(var(--muted-foreground))"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              style={{ fontSize: '12px' }}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Line 
              type="monotone" 
              dataKey="rate" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              name={t('goals.charts.engagementRate')}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Platform Comparison */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 text-foreground">
          📊 {t('goals.charts.platformComparison')}
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={platformData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="platform" 
              stroke="hsl(var(--muted-foreground))"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              style={{ fontSize: '12px' }}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Bar 
              dataKey="posts" 
              fill="hsl(var(--chart-1))" 
              name={t('goals.charts.posts')}
            />
            <Bar 
              dataKey="avgEngagement" 
              fill="hsl(var(--primary))" 
              name={t('goals.charts.avgEngagement')}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
