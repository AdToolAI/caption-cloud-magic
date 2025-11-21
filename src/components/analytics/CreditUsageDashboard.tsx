import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUsageReports } from '@/hooks/useUsageReports';
import { BarChart3, TrendingDown, Zap } from 'lucide-react';

export const CreditUsageDashboard = () => {
  const { reports, savingsAnalysis, calculateSavings } = useUsageReports();

  useEffect(() => {
    calculateSavings(30);
  }, []);

  const latestReport = reports[0];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Credits Verbraucht</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{latestReport?.total_credits_used || 0}</div>
          <p className="text-xs text-muted-foreground">Letzte 30 Tage</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Spar-Potenzial</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{savingsAnalysis?.potentialSavings || 0}</div>
          <p className="text-xs text-muted-foreground">Credits sparen möglich</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Remotion Nutzung</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{savingsAnalysis?.stats.remotionPercentage || 0}%</div>
          <p className="text-xs text-muted-foreground">der Renders</p>
        </CardContent>
      </Card>
    </div>
  );
};
