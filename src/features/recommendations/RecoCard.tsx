import { useState } from 'react';
import { Sparkles, Clock, TrendingUp, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';

interface Recommendation {
  id: string;
  type: 'time' | 'format' | 'hook' | 'caption';
  icon: any;
  text: string;
  impact: string;
  action: () => void;
}

export const RecoCard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [appliedRecs, setAppliedRecs] = useState<string[]>([]);

  // Mock recommendations - in production these would come from AI analysis
  const recommendations: Recommendation[] = [
    {
      id: 'time_1',
      type: 'time',
      icon: Clock,
      text: 'Poste Di/Do 18–20 Uhr für +12% Engagement',
      impact: '+12%',
      action: () => navigate('/post-time-advisor')
    },
    {
      id: 'format_1',
      type: 'format',
      icon: TrendingUp,
      text: 'Kurzvideo statt Karussell: +9% Views',
      impact: '+9%',
      action: () => navigate('/reel-script-generator')
    },
    {
      id: 'hook_1',
      type: 'hook',
      icon: MessageSquare,
      text: 'Hook-Stil "Neugier" performt +18%',
      impact: '+18%',
      action: () => navigate('/hook-generator')
    }
  ];

  const handleApply = (rec: Recommendation) => {
    setAppliedRecs([...appliedRecs, rec.id]);
    rec.action();
  };

  // Feature flag check
  const ffEnabled = true; // ff_reco_card

  if (!ffEnabled || recommendations.length === 0) return null;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          KI-Empfehlungen für dich
        </h3>
      </div>

      <div className="space-y-3">
        {recommendations.map((rec) => {
          const Icon = rec.icon;
          const isApplied = appliedRecs.includes(rec.id);

          return (
            <div
              key={rec.id}
              className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex-shrink-0 mt-0.5 text-muted-foreground">
                <Icon className="h-4 w-4" />
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                  {rec.text}
                </p>
              </div>

              <Button
                size="sm"
                variant={isApplied ? 'secondary' : 'ghost'}
                onClick={() => handleApply(rec)}
                disabled={isApplied}
                className="flex-shrink-0"
              >
                {isApplied ? 'Übernommen' : 'Übernehmen'}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Basierend auf deinen Performance-Daten der letzten 30 Tage
      </p>
    </Card>
  );
};
