import { tx } from '@/lib/i18nText';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CostEstimation {
  remotion: number;
  shotstack: number;
  recommended: 'remotion' | 'shotstack';
  savings: number;
  historicalAverage?: number;
  breakdown: {
    baseCost: number;
    durationCost: number;
    resolutionMultiplier: number;
    complexityMultiplier: number;
  };
}

export const useRenderCostEstimation = () => {
  const [loading, setLoading] = useState(false);
  const [estimation, setEstimation] = useState<CostEstimation | null>(null);

  const estimateCost = async (config: {
    durationSec: number;
    resolution?: '720p' | '1080p' | '4k';
    complexity?: 'simple' | 'medium' | 'complex';
    templateId?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('estimate-render-cost', {
        body: config
      });

      if (error) throw error;

      setEstimation(data as CostEstimation);
      return data as CostEstimation;
    } catch (error) {
      console.error('Error estimating cost:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getCostBreakdown = (estimation: CostEstimation) => {
    if (!estimation) return [];

    return [
      { label: tx({ de: 'Basis-Kosten', en: 'Base Costs', es: 'Costos base' }), value: estimation.breakdown.baseCost },
      { label: tx({ de: 'Dauer-Kosten', en: 'Duration Costs', es: 'Costos por duración' }), value: estimation.breakdown.durationCost },
      { 
        label: tx({ de: 'Auflösungs-Multiplikator', en: 'Resolution Multiplier', es: 'Multiplicador de resolución' }), 
        value: `${estimation.breakdown.resolutionMultiplier}x` 
      },
      { 
        label: tx({ de: 'Komplexitäts-Multiplikator', en: 'Complexity Multiplier', es: 'Multiplicador de complejidad' }), 
        value: `${estimation.breakdown.complexityMultiplier}x` 
      },
    ];
  };

  return {
    loading,
    estimation,
    estimateCost,
    getCostBreakdown,
  };
};
