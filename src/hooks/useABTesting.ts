import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ABTestConfig {
  template_id: string;
  test_name: string;
  hypothesis?: string;
  variant_a_config: any;
  variant_b_config: any;
  target_metric?: string;
  target_sample_size?: number;
  confidence_level?: number;
}

export interface ABTest {
  id: string;
  template_id: string;
  test_name: string;
  hypothesis: string | null;
  variant_a_config: any;
  variant_b_config: any;
  target_metric: string;
  target_sample_size: number;
  confidence_level: number;
  status: string;
  winner_variant: string | null;
  statistical_significance: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
}

export interface VariantMetrics {
  views: number;
  selections: number;
  creates: number;
  publishes: number;
  conversionRate: number;
}

export interface StatisticalTest {
  z: number;
  pValue: number;
  isSignificant: boolean;
}

export interface ABTestResults {
  test: ABTest;
  results: {
    variant_a: VariantMetrics;
    variant_b: VariantMetrics;
    statistical_test: StatisticalTest;
    winner: string | null;
    winner_lift: number;
    sample_progress: number;
    is_complete: boolean;
  };
}

export function useABTesting() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTest = async (config: ABTestConfig): Promise<ABTest | null> => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: createError } = await supabase.functions.invoke(
        'create-ab-test',
        {
          body: config,
        }
      );

      if (createError) throw createError;
      return data.test as ABTest;
    } catch (err) {
      console.error('Error creating A/B test:', err);
      setError(err instanceof Error ? err.message : 'Failed to create test');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getTestResults = async (testId: string): Promise<ABTestResults | null> => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: resultsError } = await supabase.functions.invoke(
        'get-ab-test-results',
        {
          body: { test_id: testId },
        }
      );

      if (resultsError) throw resultsError;
      return data as ABTestResults;
    } catch (err) {
      console.error('Error fetching test results:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch results');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const startTest = async (testId: string): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('template_ab_tests')
        .update({
          status: 'active',
          started_at: new Date().toISOString(),
        } as any)
        .eq('id', testId);

      if (updateError) throw updateError;
      return true;
    } catch (err) {
      console.error('Error starting test:', err);
      setError(err instanceof Error ? err.message : 'Failed to start test');
      return false;
    }
  };

  const pauseTest = async (testId: string): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('template_ab_tests')
        .update({ status: 'paused' } as any)
        .eq('id', testId);

      if (updateError) throw updateError;
      return true;
    } catch (err) {
      console.error('Error pausing test:', err);
      setError(err instanceof Error ? err.message : 'Failed to pause test');
      return false;
    }
  };

  const completeTest = async (testId: string, winnerVariant?: string): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('template_ab_tests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          winner_variant: winnerVariant || null,
        } as any)
        .eq('id', testId);

      if (updateError) throw updateError;
      return true;
    } catch (err) {
      console.error('Error completing test:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete test');
      return false;
    }
  };

  const fetchActiveTests = async (templateId?: string) => {
    setLoading(true);
    setError(null);

    try {
      let query: any = supabase.from('template_ab_tests').select('*').eq('status', 'active');
      if (templateId) {
        query = query.eq('template_id', templateId);
      }
      const result: any = await query;
      const { data, error: fetchError } = result;

      if (fetchError) throw fetchError;

      const typedData: ABTest[] = (data || []).map((item: any) => ({
        id: item.id,
        template_id: item.template_id,
        test_name: item.test_name,
        hypothesis: item.hypothesis,
        variant_a_config: item.variant_a_config,
        variant_b_config: item.variant_b_config,
        target_metric: item.target_metric,
        target_sample_size: item.target_sample_size,
        confidence_level: item.confidence_level,
        status: item.status,
        winner_variant: item.winner_variant,
        statistical_significance: item.statistical_significance,
        created_at: item.created_at,
        started_at: item.started_at,
        completed_at: item.completed_at,
        created_by: item.created_by,
      }));

      setTests(typedData);
    } catch (err) {
      console.error('Error fetching active tests:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tests');
    } finally {
      setLoading(false);
    }
  };

  return {
    tests,
    loading,
    error,
    createTest,
    getTestResults,
    startTest,
    pauseTest,
    completeTest,
    fetchActiveTests,
  };
}
