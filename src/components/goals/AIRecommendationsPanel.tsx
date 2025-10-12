import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, Clock } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface Recommendation {
  title: string;
  detail: string;
  impact: 'hoch' | 'mittel' | 'niedrig';
  eta: string;
}

interface AIRecommendationsPanelProps {
  recommendations: Recommendation[];
  trends: {
    engagementTrend: number;
    bestHours: string[];
  };
}

export function AIRecommendationsPanel({ recommendations, trends }: AIRecommendationsPanelProps) {
  const { t } = useTranslation();

  const getImpactColor = (impact: string) => {
    switch (impact.toLowerCase()) {
      case 'hoch':
      case 'high':
        return 'bg-red-500/10 text-red-700 dark:text-red-400';
      case 'mittel':
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400';
      case 'niedrig':
      case 'low':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
      default:
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Trends Section */}
      <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          {t('goals.trends.title')}
        </h3>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('goals.trends.engagement')}</span>
            <span className={`text-lg font-bold ${trends.engagementTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trends.engagementTrend >= 0 ? '+' : ''}{trends.engagementTrend}%
            </span>
          </div>

          {trends.bestHours && trends.bestHours.length > 0 && (
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground mb-1">
                  {t('goals.trends.bestTimes')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {trends.bestHours.join(', ')}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* AI Recommendations */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          {t('goals.recommendations.title')}
        </h3>

        {recommendations && recommendations.length > 0 ? (
          <div className="space-y-4">
            {recommendations.map((rec, index) => (
              <div key={index} className="p-4 bg-muted/50 rounded-lg border border-border">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 className="font-semibold text-foreground flex-1">{rec.title}</h4>
                  <div className="flex gap-2 flex-shrink-0">
                    <Badge className={getImpactColor(rec.impact)}>
                      {rec.impact}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {rec.eta}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{rec.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{t('goals.recommendations.noData')}</p>
            <p className="text-xs mt-1">{t('goals.recommendations.addMoreData')}</p>
          </div>
        )}
      </Card>

      {/* Quick Wins Section */}
      {recommendations && recommendations.filter(r => r.impact.toLowerCase() === 'hoch' || r.impact.toLowerCase() === 'high').length > 0 && (
        <Card className="p-6 bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20">
          <h3 className="text-lg font-semibold mb-3 text-foreground">
            🚀 {t('goals.quickWins.title')}
          </h3>
          <ul className="space-y-2">
            {recommendations
              .filter(r => r.impact.toLowerCase() === 'hoch' || r.impact.toLowerCase() === 'high')
              .map((rec, index) => (
                <li key={index} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-green-600 font-bold">•</span>
                  <span>{rec.title}</span>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
