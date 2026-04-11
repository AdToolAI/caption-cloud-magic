import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUsageReports } from '@/hooks/useUsageReports';
import { useTranslation } from '@/hooks/useTranslation';
import { BarChart3, TrendingDown, Zap } from 'lucide-react';

export const CreditUsageDashboard = () => {
  const { reports, savingsAnalysis, calculateSavings } = useUsageReports();
  const { t } = useTranslation();

  useEffect(() => {
    calculateSavings(30);
  }, []);

  const latestReport = reports[0];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('usageReports.creditsUsed')}</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{latestReport?.total_credits_used || 0}</div>
          <p className="text-xs text-muted-foreground">{t('usageReports.last30Days')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('usageReports.savingsPotential')}</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{savingsAnalysis?.potentialSavings || 0}</div>
          <p className="text-xs text-muted-foreground">{t('usageReports.creditsSavable')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('usageReports.remotionUsage')}</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{savingsAnalysis?.stats.remotionPercentage || 0}%</div>
          <p className="text-xs text-muted-foreground">{t('usageReports.ofRenders')}</p>
        </CardContent>
      </Card>
    </div>
  );
};
