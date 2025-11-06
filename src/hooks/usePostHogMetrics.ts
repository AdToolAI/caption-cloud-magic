import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PostHogMetrics {
  // Overview
  signupToPostRate: number;
  signupToPostTrend?: { value: number; isPositive: boolean };
  onboardingCompletionRate: number;
  onboardingTrend?: { value: number; isPositive: boolean };
  upgradeConversionRate: number;
  upgradeTrend?: { value: number; isPositive: boolean };
  activeUsers: number;

  // Detailed Funnel Data
  signupFunnel?: {
    signups: number;
    firstPostCreated: number;
    conversionRate: number;
    avgTimeToFirstPost: number; // in hours
  };

  onboardingMetrics?: {
    started: number;
    completed: number;
    completionRate: number;
    avgDuration: number; // in seconds
    dropoffByStep: Array<{ step: number; name: string; dropoff: number }>;
  };

  upgradeFunnel?: {
    freeUsers: number;
    limitReached: number;
    upgradeClicked: number;
    paymentCompleted: number;
    conversionRates: {
      limitToClick: number;
      clickToPayment: number;
      overallConversion: number;
    };
    topTriggers: Array<{ feature: string; count: number }>;
  };

  // Retention Metrics (Phase 3)
  retentionMetrics?: {
    day1Retention: number;
    day1Trend: { value: number; isPositive: boolean };
    day7Retention: number;
    day7Trend: { value: number; isPositive: boolean };
    day30Retention: number;
    day30Trend: { value: number; isPositive: boolean };
    cohorts: Array<{
      cohortDate: string;
      signups: number;
      day1: number;
      day7: number;
      day30: number;
    }>;
  };
}

export function usePostHogMetrics() {
  const [metrics, setMetrics] = useState<PostHogMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase.functions.invoke('posthog-analytics', {
        body: { action: 'getMetrics' }
      });

      if (fetchError) throw fetchError;
      
      setMetrics(data);
    } catch (err) {
      console.error('Failed to fetch PostHog metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
      
      // Set fallback data
      setMetrics({
        signupToPostRate: 0,
        onboardingCompletionRate: 0,
        upgradeConversionRate: 0,
        activeUsers: 0
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  return {
    metrics,
    loading,
    error,
    refetch: fetchMetrics
  };
}
