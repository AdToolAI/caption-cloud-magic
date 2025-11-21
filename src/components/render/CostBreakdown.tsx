import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CostEstimation } from '@/hooks/useRenderCostEstimation';
import { Info } from 'lucide-react';

interface CostBreakdownProps {
  estimation: CostEstimation;
}

export const CostBreakdown = ({ estimation }: CostBreakdownProps) => {
  const items = [
    {
      label: 'Basis-Kosten',
      value: `${estimation.breakdown.baseCost} Credits`,
      description: 'Grundkosten pro Render'
    },
    {
      label: 'Dauer-Kosten',
      value: `${estimation.breakdown.durationCost} Credits`,
      description: 'Basierend auf Video-Länge'
    },
    {
      label: 'Auflösungs-Faktor',
      value: `×${estimation.breakdown.resolutionMultiplier}`,
      description: 'Multiplikator für höhere Auflösung'
    },
    {
      label: 'Komplexitäts-Faktor',
      value: `×${estimation.breakdown.complexityMultiplier}`,
      description: 'Multiplikator für Animations-Komplexität'
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="w-4 h-4" />
          Kosten-Aufschlüsselung
        </CardTitle>
        <CardDescription>
          Detaillierte Berechnung
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div 
              key={index}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex-1">
                <div className="font-medium text-sm">{item.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {item.description}
                </div>
              </div>
              <div className="font-bold text-sm">{item.value}</div>
            </div>
          ))}

          <div className="pt-3 border-t mt-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Gesamt ({estimation.recommended})</span>
              <span className="text-lg font-bold">
                {estimation.recommended === 'remotion' ? estimation.remotion : estimation.shotstack} Credits
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
