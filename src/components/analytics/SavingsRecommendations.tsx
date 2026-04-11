import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, Lightbulb, AlertCircle } from 'lucide-react';
import { useUsageReports } from '@/hooks/useUsageReports';
import { useTranslation } from '@/hooks/useTranslation';
import { useEffect } from 'react';

export const SavingsRecommendations = () => {
  const { savingsAnalysis, calculateSavings } = useUsageReports();
  const { t } = useTranslation();

  useEffect(() => {
    calculateSavings(30);
  }, []);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-100';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100';
      case 'low':
        return 'text-blue-600 bg-blue-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return AlertCircle;
      case 'medium':
        return TrendingDown;
      default:
        return Lightbulb;
    }
  };

  if (!savingsAnalysis || savingsAnalysis.recommendations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5" />
            {t('usageReports.savingsRecommendations')}
          </CardTitle>
          <CardDescription>
            {t('usageReports.optimizationTips')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            {t('usageReports.noRecommendations')}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="w-5 h-5" />
          {t('usageReports.savingsRecommendations')}
        </CardTitle>
        <CardDescription>
          {t('usageReports.potentialSave', { count: savingsAnalysis.potentialSavings })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {savingsAnalysis.recommendations.map((rec, index) => {
            const PriorityIcon = getPriorityIcon(rec.priority);
            return (
              <div 
                key={index}
                className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${getPriorityColor(rec.priority)}`}>
                    <PriorityIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {rec.type}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {rec.savingsPotential} {t('usageReports.credits')}
                      </Badge>
                    </div>
                    <p className="text-sm">{rec.message}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 p-4 bg-primary/10 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('usageReports.totalSavingsPotential')}</span>
            <span className="text-2xl font-bold text-primary">
              {savingsAnalysis.potentialSavings} {t('usageReports.credits')}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
