import { Card } from '@/components/ui/card';
import { Database } from '@/integrations/supabase/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { Badge } from '@/components/ui/badge';

type ABTestVariant = Database['public']['Tables']['ab_test_variants']['Row'];

interface Props {
  variants: ABTestVariant[];
  targetMetric: string;
}

export function TestPerformanceComparison({ variants, targetMetric }: Props) {
  const barChartData = variants.map(v => ({
    name: v.variant_name,
    'Views': v.views || 0,
    'Engagement %': v.engagement_rate || 0,
    'Conversion %': v.conversion_rate || 0
  }));

  const radarData = [
    {
      metric: 'Views',
      ...Object.fromEntries(variants.map(v => [v.variant_name, (v.views || 0) / 10]))
    },
    {
      metric: 'Engagement',
      ...Object.fromEntries(variants.map(v => [v.variant_name, v.engagement_rate || 0]))
    },
    {
      metric: 'Conversion',
      ...Object.fromEntries(variants.map(v => [v.variant_name, v.conversion_rate || 0]))
    },
    {
      metric: 'Sample Size',
      ...Object.fromEntries(variants.map(v => [v.variant_name, Math.min((v.views || 0) / 10, 10)]))
    }
  ];

  // Calculate winner based on target metric
  const getMetricValue = (variant: ABTestVariant) => {
    switch (targetMetric) {
      case 'views':
        return variant.views || 0;
      case 'engagement_rate':
        return variant.engagement_rate || 0;
      case 'conversion_rate':
        return variant.conversion_rate || 0;
      case 'watch_time':
        return variant.avg_watch_time || 0;
      default:
        return variant.engagement_rate || 0;
    }
  };

  const sortedVariants = [...variants].sort((a, b) => getMetricValue(b) - getMetricValue(a));
  const leader = sortedVariants[0];
  const leaderValue = getMetricValue(leader);

  // Calculate statistical significance (simplified)
  const hasSignificantData = variants.every(v => (v.views || 0) >= 100);
  
  const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--secondary))', 'hsl(var(--muted))'];

  return (
    <div className="space-y-6">
      {/* Leader Board */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">🏆 Aktueller Leader</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold">{leader.variant_name}</p>
            <p className="text-sm text-muted-foreground">
              {targetMetric === 'views' && `${leaderValue.toLocaleString('de-DE')} Views`}
              {targetMetric === 'engagement_rate' && `${leaderValue.toFixed(1)}% Engagement`}
              {targetMetric === 'conversion_rate' && `${leaderValue.toFixed(1)}% Conversion`}
              {targetMetric === 'watch_time' && `${leaderValue.toFixed(0)}s Watch Time`}
            </p>
          </div>
          <Badge variant={hasSignificantData ? 'default' : 'secondary'}>
            {hasSignificantData ? 'Statistisch signifikant' : 'Benötigt mehr Daten'}
          </Badge>
        </div>

        {!hasSignificantData && (
          <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 text-sm">
            ⚠️ Warte auf mindestens 100 Views pro Variante für statistisch signifikante Ergebnisse
          </div>
        )}
      </Card>

      {/* Comparison Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Bar Chart */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Metriken-Vergleich</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Views" fill={COLORS[0]} />
              <Bar dataKey="Engagement %" fill={COLORS[1]} />
              <Bar dataKey="Conversion %" fill={COLORS[2]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Radar Chart */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Performance Radar</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" />
              <PolarRadiusAxis />
              {variants.map((variant, idx) => (
                <Radar
                  key={variant.id}
                  name={variant.variant_name}
                  dataKey={variant.variant_name}
                  stroke={COLORS[idx % COLORS.length]}
                  fill={COLORS[idx % COLORS.length]}
                  fillOpacity={0.3}
                />
              ))}
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Detailed Comparison Table */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Detaillierter Vergleich</h3>
        <div className="space-y-3">
          {sortedVariants.map((variant, idx) => {
            const metricValue = getMetricValue(variant);
            const percentDiff = idx > 0 ? ((metricValue - getMetricValue(sortedVariants[0])) / getMetricValue(sortedVariants[0])) * 100 : 0;

            return (
              <div key={variant.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold">
                  {idx + 1}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium">{variant.variant_name}</p>
                    {variant.variant_type === 'control' && <Badge variant="outline">Control</Badge>}
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>{variant.views || 0} Views</span>
                    <span>{(variant.engagement_rate || 0).toFixed(1)}% Engagement</span>
                    <span>{(variant.conversion_rate || 0).toFixed(1)}% Conversion</span>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-lg font-bold">
                    {targetMetric === 'views' && metricValue.toLocaleString('de-DE')}
                    {targetMetric !== 'views' && `${metricValue.toFixed(1)}%`}
                  </p>
                  {idx > 0 && (
                    <p className={`text-sm ${percentDiff > 0 ? 'text-success' : 'text-danger'}`}>
                      {percentDiff > 0 ? '+' : ''}{percentDiff.toFixed(1)}% vs. Leader
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
