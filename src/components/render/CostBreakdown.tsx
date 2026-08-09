import { tx } from "@/lib/i18nText";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CostEstimation } from '@/hooks/useRenderCostEstimation';
import { Info } from 'lucide-react';

interface CostBreakdownProps {
  estimation: CostEstimation;
}

export const CostBreakdown = ({ estimation }: CostBreakdownProps) => {
  const items = [
    {
      label: tx({ de: "Basis-Kosten", en: "Base cost", es: "Coste base" }),
      value: `${estimation.breakdown.baseCost} Credits`,
      description: tx({ de: "Grundkosten pro Render", en: "Base cost per render", es: "Coste base por render" })
    },
    {
      label: tx({ de: "Dauer-Kosten", en: "Duration cost", es: "Coste de duración" }),
      value: `${estimation.breakdown.durationCost} Credits`,
      description: tx({ de: 'Basierend auf Video-Länge', en: 'Based on video length', es: 'Basado en la duración del video' })
    },
    {
      label: tx({ de: "Auflösungs-Faktor", en: "Resolution factor", es: "Factor de resolución" }),
      value: `×${estimation.breakdown.resolutionMultiplier}`,
      description: tx({ de: 'Multiplikator für höhere Auflösung', en: 'Multiplier for higher resolution', es: 'Multiplicador para mayor resolución' })
    },
    {
      label: tx({ de: "Komplexitäts-Faktor", en: "Complexity factor", es: "Factor de complejidad" }),
      value: `×${estimation.breakdown.complexityMultiplier}`,
      description: tx({ de: 'Multiplikator für Animations-Komplexität', en: 'Animation complexity multiplier', es: 'Multiplicador de complejidad de animación' })
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="w-4 h-4" />
          {tx({ de: "Kosten-Aufschlüsselung", en: "Cost breakdown", es: "Desglose de costes" })}
        </CardTitle>
        <CardDescription>
          {tx({ de: "Detaillierte Berechnung", en: "Detailed calculation", es: "Cálculo detallado" })}
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
              <span className="font-semibold">{tx({ de: "Gesamt", en: "Total", es: "Total" })} ({estimation.recommended})</span>
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
