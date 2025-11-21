import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingDown, Zap } from 'lucide-react';
import { CostEstimation } from '@/hooks/useRenderCostEstimation';

interface CostEstimationCardProps {
  estimation: CostEstimation;
}

export const CostEstimationCard = ({ estimation }: CostEstimationCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="w-4 h-4" />
          Kosten-Schätzung
        </CardTitle>
        <CardDescription>
          Basierend auf Video-Parametern
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Remotion</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{estimation.remotion}</span>
              <span className="text-xs text-muted-foreground">Credits</span>
              {estimation.recommended === 'remotion' && (
                <Badge variant="default" className="ml-2">Empfohlen</Badge>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-secondary" />
              <span className="font-medium text-sm">Shotstack</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{estimation.shotstack}</span>
              <span className="text-xs text-muted-foreground">Credits</span>
              {estimation.recommended === 'shotstack' && (
                <Badge variant="default" className="ml-2">Empfohlen</Badge>
              )}
            </div>
          </div>

          {estimation.savings > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
              <TrendingDown className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700">
                Spare <strong>{estimation.savings} Credits</strong> mit {estimation.recommended === 'remotion' ? 'Remotion' : 'Shotstack'}
              </span>
            </div>
          )}

          {estimation.historicalAverage && (
            <div className="pt-3 border-t text-xs text-muted-foreground">
              Historischer Durchschnitt: {estimation.historicalAverage} Credits
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
