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
      
      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('balance, plan_code, monthly_credits, last_reset_at')
        .eq('user_id', user.id)
        .single();

      if (walletError) throw walletError;

      setBalance(wallet);
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
    
    // Realtime subscription for wallet updates
    const channel = supabase
      .channel(`wallet-${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          fetchBalance();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return {
    balance,
    loading,
    error,
    refetch: fetchBalance
  };
};
