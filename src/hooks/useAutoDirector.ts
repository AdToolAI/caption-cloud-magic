import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type AutoDirectorMood = 'cinematic' | 'hype' | 'calm' | 'corporate' | 'playful' | 'dramatic';
export type AutoDirectorEnginePref = 'auto' | 'premium' | 'budget';

export interface PlannedScene {
  orderIndex: number;
  sceneType: string;
  durationSeconds: number;
  aiPrompt: string;
  recommendedEngine: string;
  textOverlay?: { text: string; position: 'top' | 'center' | 'bottom' } | null;
}

export interface AutoDirectorPlan {
  scenes: PlannedScene[];
  estimatedCostEuros: number;
  rationale: string;
}

export interface AutoDirectorPlanInput {
  idea: string;
  mood: AutoDirectorMood;
  targetDurationSec: 15 | 30 | 60;
  enginePreference?: AutoDirectorEnginePref;
  language?: string;
}

export interface AutoDirectorExecuteInput extends AutoDirectorPlanInput {
  approvedScenes: PlannedScene[];
  title?: string;
  voicePreset?: string | null;
  musicMood?: string | null;
}

export const useAutoDirector = () => {
  const [planning, setPlanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [plan, setPlan] = useState<AutoDirectorPlan | null>(null);

  const generatePlan = useCallback(async (input: AutoDirectorPlanInput): Promise<AutoDirectorPlan | null> => {
    setPlanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-director-compose', {
        body: { stage: 'plan', ...input },
      });
      if (error) throw error;
      if (!data?.ok || !data?.plan) {
        throw new Error(data?.message || data?.error || 'Plan generation failed');
      }
      setPlan(data.plan as AutoDirectorPlan);
      return data.plan as AutoDirectorPlan;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Plan generation failed';
      toast({ title: 'Auto-Director Fehler', description: msg, variant: 'destructive' });
      return null;
    } finally {
      setPlanning(false);
    }
  }, []);

  const execute = useCallback(async (input: AutoDirectorExecuteInput): Promise<{ projectId: string } | null> => {
    setExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-director-compose', {
        body: { stage: 'execute', ...input },
      });
      if (error) throw error;
      if (!data?.ok || !data?.projectId) {
        throw new Error(data?.message || data?.error || 'Execution failed');
      }
      toast({
        title: '✨ Auto-Director gestartet',
        description: `${data.sceneCount} Szenen werden generiert (~${data.estimatedCostEuros.toFixed(2)}€).`,
      });
      return { projectId: data.projectId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Execution failed';
      toast({ title: 'Auto-Director Fehler', description: msg, variant: 'destructive' });
      return null;
    } finally {
      setExecuting(false);
    }
  }, []);

  return { planning, executing, plan, setPlan, generatePlan, execute };
};
