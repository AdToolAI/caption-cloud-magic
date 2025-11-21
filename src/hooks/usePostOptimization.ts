import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Improvement {
  category: 'text' | 'hashtags' | 'timing' | 'format';
  current: string;
  suggested: string;
  reason: string;
  impact: 'low' | 'medium' | 'high';
  estimated_gain: string;
}

interface OptimizationResult {
  optimization_id: string;
  score: number;
  improvements: Improvement[];
  optimal_posting_time: string;
  hook_alternatives: string[];
}

export function usePostOptimization() {
  const [loading, setLoading] = useState(false);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const { toast } = useToast();

  const analyzePost = async (params: {
    post_id?: string;
    draft_id?: string;
    caption?: string;
    hashtags?: string[];
    platforms?: string[];
  }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-post-optimization', {
        body: params,
      });

      if (error) throw error;

      setOptimization(data);
      toast({
        title: 'Analyse abgeschlossen',
        description: `Optimierungs-Score: ${data.score}/100`,
      });

      return data;
    } catch (error) {
      console.error('Error analyzing post:', error);
      toast({
        title: 'Fehler',
        description: 'Post-Analyse fehlgeschlagen',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const applyOptimizations = async (optimization_id: string, selected_improvements: number[]) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('apply-optimization', {
        body: { optimization_id, selected_improvements },
      });

      if (error) throw error;

      toast({
        title: 'Optimierungen angewendet',
        description: `${data.applied_count} Verbesserungen wurden übernommen`,
      });

      return data;
    } catch (error) {
      console.error('Error applying optimizations:', error);
      toast({
        title: 'Fehler',
        description: 'Optimierungen konnten nicht angewendet werden',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getOptimizationHistory = async (post_id?: string, draft_id?: string) => {
    try {
      let query = supabase
        .from('post_optimizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (post_id) {
        query = query.eq('post_id', post_id);
      } else if (draft_id) {
        query = query.eq('draft_id', draft_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching optimization history:', error);
      return [];
    }
  };

  return {
    loading,
    optimization,
    analyzePost,
    applyOptimizations,
    getOptimizationHistory,
  };
}
