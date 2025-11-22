import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AnalyticsFilterState } from '@/components/analytics/AnalyticsFilters';

export interface RecentEvent {
  event: string;
  timestamp: string;
  distinctId: string;
  properties: Record<string, any>;
}

export interface PostHogMetrics {
  // Overview
  signupToPostRate: number;
  signupToPostTrend?: { value: number; isPositive: boolean };
  onboardingCompletionRate: number;
  onboardingTrend?: { value: number; isPositive: boolean };
  upgradeConversionRate: number;
  upgradeTrend?: { value: number; isPositive: boolean };
  activeUsers: number;
  
  // Live Events
  recentEvents?: RecentEvent[];

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
  const [loadingDetailed, setLoadingDetailed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default: last 30 days
    to: new Date()
  });
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [filters, setFilters] = useState<AnalyticsFilterState>({
    planTypes: [],
    signupMethods: [],
    userStatus: []
  });

  const fetchMetrics = async (
    customRange?: { from: Date; to: Date }, 
    customCompare?: boolean,
    customFilters?: AnalyticsFilterState,
    forceRefresh = false
  ) => {
    setLoading(true);
    setLoadingDetailed(true);
    setError(null);

    const range = customRange || dateRange;
    const compare = customCompare !== undefined ? customCompare : compareEnabled;
    const activeFilters = customFilters || filters;

    try {
      const { data, error: fetchError } = await supabase.functions.invoke('posthog-analytics', {
        body: { 
          action: 'getMetrics',
          startDate: range.from.toISOString(),
          endDate: range.to.toISOString(),
          compareEnabled: compare,
          filters: activeFilters,
          forceRefresh
        }
      });

      if (fetchError) throw fetchError;
      
      setMetrics(data);
      setLastRefresh(new Date());
      setLoading(false);
      
      // Detailed metrics are loaded at the same time for now
      // In a future optimization, these could be split into separate requests
      setLoadingDetailed(false);
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
      setLoadingDetailed(false);
    }
  };

  const updateDateRange = (newRange: { from: Date; to: Date }, newCompare: boolean) => {
    setDateRange(newRange);
    setCompareEnabled(newCompare);
    fetchMetrics(newRange, newCompare, filters);
  };

  const updateFilters = (newFilters: AnalyticsFilterState) => {
    setFilters(newFilters);
    fetchMetrics(dateRange, compareEnabled, newFilters);
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  // Auto-refresh functionality
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchMetrics();
      }, 30000); // 30 seconds
      
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  return {
    metrics,
    loading,
    loadingDetailed,
    error,
    refetch: fetchMetrics,
    autoRefresh,
    setAutoRefresh,
    lastRefresh,
    dateRange,
    compareEnabled,
    updateDateRange,
    filters,
    updateFilters
  };
}
