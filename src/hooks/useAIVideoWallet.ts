import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface AIVideoWallet {
  balance_euros: number;
  total_purchased_euros: number;
  total_spent_euros: number;
}

export const useAIVideoWallet = () => {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<AIVideoWallet | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWallet = async () => {
    if (!user) {
      setWallet(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('ai_video_wallets')
        .select('balance_euros, total_purchased_euros, total_spent_euros')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Ignore "not found" error
        throw error;
      }

      setWallet(data || { balance_euros: 0, total_purchased_euros: 0, total_spent_euros: 0 });
    } catch (err) {
      console.error('Error fetching AI Video wallet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();

    // Realtime subscription
    const channel = supabase
      .channel(`ai_video_wallet_${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_video_wallets',
          filter: `user_id=eq.${user?.id}`,
        },
        () => fetchWallet()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return { wallet, loading, refetch: fetchWallet };
};
