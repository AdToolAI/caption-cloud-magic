import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UsageReport {
  id: string;
  user_id: string;
  report_period: 'daily' | 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  total_credits_used: number;
  breakdown_by_feature: Record<string, number>;
  breakdown_by_template: Record<string, number>;
  breakdown_by_engine: Record<string, number>;
  top_cost_drivers: Array<{ feature: string; credits: number }>;
  cost_savings_potential: any;
}

export interface CostSavings {
  totalSpent: number;
  potentialSavings: number;
  recommendations: Array<{
    type: string;
    priority: string;
    message: string;
    savingsPotential: number;
  }>;
  stats: {
    totalRenders: number;
    remotionCount: number;
    shotstackCount: number;
    remotionPercentage: number;
    repeatedTemplates: number;
  };
}

export const useUsageReports = () => {
  const [reports, setReports] = useState<UsageReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingsAnalysis, setSavingsAnalysis] = useState<CostSavings | null>(null);

  const generateReport = async (config: {
    periodStart: string;
    periodEnd: string;
    reportPeriod?: 'daily' | 'weekly' | 'monthly';
  }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-usage-report', {
        body: config
      });

      if (error) throw error;

      toast.success('Report generiert!');
      await fetchReports();
      return data;
    } catch (error: any) {
      console.error('Error generating report:', error);
      toast.error(error.message || 'Fehler beim Generieren des Reports');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from('credit_usage_reports')
        .select('*')
        .order('period_start', { ascending: false })
        .limit(10);

      if (error) throw error;

      setReports(data as unknown as UsageReport[]);
    } catch (error) {
      console.error('Error fetching reports:', error);
    }
  };

  const calculateSavings = async (days: number = 30) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calculate-cost-savings', {
        body: { days }
      });

      if (error) throw error;

      setSavingsAnalysis(data as CostSavings);
      return data as CostSavings;
    } catch (error) {
      console.error('Error calculating savings:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const trackUsage = async (config: {
    featureCode: string;
    creditsUsed: number;
    templateId?: string;
    engine?: string;
    metadata?: any;
  }) => {
    try {
      const { error } = await supabase.functions.invoke('track-credit-usage', {
        body: config
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error tracking usage:', error);
      return false;
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  return {
    reports,
    loading,
    savingsAnalysis,
    generateReport,
    fetchReports,
    calculateSavings,
    trackUsage,
  };
};
