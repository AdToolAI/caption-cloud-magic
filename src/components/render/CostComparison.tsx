import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Zap } from 'lucide-react';

interface CostComparisonProps {
  remotionCost: number;
  shotstackCost: number;
}

export const CostComparison = ({ remotionCost, shotstackCost }: CostComparisonProps) => {
  const total = remotionCost + shotstackCost;
  const remotionPercent = (remotionCost / total) * 100;
  const shotstackPercent = (shotstackCost / total) * 100;
  const savings = Math.abs(remotionCost - shotstackCost);
  const cheaperOption = remotionCost < shotstackCost ? 'Remotion' : 'Shotstack';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kosten-Vergleich</CardTitle>
        <CardDescription>
          Side-by-side Engine Vergleich
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Remotion
              </span>
              <Badge variant="secondary">{remotionCost} Credits</Badge>
            </div>
            <Progress value={remotionPercent} className="h-2" />
            <div className="text-xs text-muted-foreground mt-1">
              {remotionPercent.toFixed(1)}% der Gesamtkosten
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <Zap className="w-4 h-4 text-secondary" />
                Shotstack
              </span>
              <Badge variant="secondary">{shotstackCost} Credits</Badge>
            </div>
            <Progress value={shotstackPercent} className="h-2" />
            <div className="text-xs text-muted-foreground mt-1">
              {shotstackPercent.toFixed(1)}% der Gesamtkosten
            </div>
          </div>

          <div className="pt-4 border-t">
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-muted-foreground">{cheaperOption} ist</span>
              <Badge variant="default" className="flex items-center gap-1">
                <ArrowRight className="w-3 h-3" />
                {savings} Credits günstiger
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
