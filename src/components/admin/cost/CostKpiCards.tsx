import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud, Sparkles, Server, TrendingUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface Summary {
  cloud_cost_usd: number;
  ai_cost_usd: number;
  lambda_minutes: number;
  lambda_active_now: number;
  forecast_cloud_usd: number;
  forecast_ai_usd: number;
  cloud_percent_of_free: number;
  ai_percent_of_free: number;
}

export function CostKpiCards({ summary, days }: { summary: Summary; days: number }) {
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const pctColor = (p: number) =>
    p >= 80 ? 'text-destructive' : p >= 50 ? 'text-yellow-500' : 'text-green-500';

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Cloud Spend (est.)</CardTitle>
          <Cloud className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmt(summary.cloud_cost_usd)}</div>
          <p className="text-xs text-muted-foreground mt-1">letzte {days} Tage · von $25 Free</p>
          <Progress value={Math.min(summary.cloud_percent_of_free, 100)} className="mt-2 h-1.5" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">AI Spend (est.)</CardTitle>
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmt(summary.ai_cost_usd)}</div>
          <p className="text-xs text-muted-foreground mt-1">Lovable AI Gateway · von $1 Free</p>
          <Progress value={Math.min(summary.ai_percent_of_free, 100)} className="mt-2 h-1.5" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Lambda Renders</CardTitle>
          <Server className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary.lambda_minutes.toFixed(1)} min</div>
          <p className="text-xs text-muted-foreground mt-1">
            {summary.lambda_active_now}/3 aktiv jetzt
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Forecast Monat</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmt(summary.forecast_cloud_usd)}</div>
          <p className={`text-xs mt-1 font-medium ${pctColor(summary.cloud_percent_of_free)}`}>
            {summary.cloud_percent_of_free.toFixed(0)}% des Free-Tiers
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
