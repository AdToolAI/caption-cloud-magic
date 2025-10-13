import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface CreditBalance {
  balance: number;
  plan_code: string;
  monthly_credits: number;
  last_reset_at: string;
}

export const useCredits = () => {
  const { user } = useAuth();
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = async () => {
    if (!user) {
      setBalance(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // TODO: Replace with actual wallet query once migration is approved
      // Mock data for now
      setBalance({
        balance: 5000,
        plan_code: 'pro',
        monthly_credits: 10000,
        last_reset_at: new Date().toISOString()
      });
      setError(null);
    } catch (err) {
      console.error('Error fetching credit balance:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
    // TODO: Add realtime subscription once wallet table is created
  }, [user?.id]);

  return {
    balance,
    loading,
    error,
    refetch: fetchBalance
  };
};
