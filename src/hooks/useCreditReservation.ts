import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ESTIMATED_COSTS } from '@/lib/featureCosts';

export interface ReservationResult {
  reservation_id: string;
  reserved_amount: number;
  expires_at: string;
}

/**
 * v428: Only external AI media (video models, music, premium image, voice) is billed.
 * Every ordinary feature — rendering, exports, text, scheduling — is included in
 * every plan. Features whose cost resolves to 0 skip the credit backend entirely.
 */
const FREE_RESERVATION_PREFIX = 'free:';

const resolveCost = (feature_code: string, estimated_cost?: number): number => {
  if (typeof estimated_cost === 'number') return estimated_cost;
  return ESTIMATED_COSTS[feature_code] ?? 0;
};

export const isFreeFeature = (feature_code: string, estimated_cost?: number): boolean =>
  resolveCost(feature_code, estimated_cost) <= 0;

export const useCreditReservation = () => {
  const [loading, setLoading] = useState(false);

  const checkPreflight = async (feature_code: string, estimated_cost?: number) => {
    if (isFreeFeature(feature_code, estimated_cost)) {
      return { allowed: true, required_credits: 0, available_balance: 0, free: true };
    }
    try {
      const { data, error } = await supabase.functions.invoke('credit-preflight', {
        body: { feature_code, estimated_cost }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Preflight check failed:', error);
      throw error;
    }
  };

  const reserve = async (
    feature_code: string,
    estimated_cost?: number,
    metadata?: Record<string, any>
  ): Promise<ReservationResult> => {
    if (isFreeFeature(feature_code, estimated_cost)) {
      return {
        reservation_id: `${FREE_RESERVATION_PREFIX}${feature_code}`,
        reserved_amount: 0,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      };
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('credit-reserve', {
        body: { feature_code, estimated_cost, metadata }
      });

      if (error) throw error;
      if (!data.success) {
        throw new Error(data.error || 'Failed to reserve credits');
      }

      return {
        reservation_id: data.reservation_id,
        reserved_amount: data.reserved_amount,
        expires_at: data.expires_at
      };
    } catch (error) {
      console.error('Credit reservation failed:', error);
      toast({
        title: tx({ de: 'Nicht genügend KI-Guthaben', en: 'Insufficient AI credits', es: 'Saldo de IA insuficiente' }),
        description: tx({ de: 'Bitte lade dein KI-Guthaben auf, um dieses KI-Modell zu nutzen.', en: 'Please top up your AI credits to use this AI model.', es: 'Recarga tu saldo de IA para usar este modelo de IA.' }),
        variant: 'destructive'
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const commit = async (reservation_id: string, actual_cost?: number) => {
    if (reservation_id.startsWith(FREE_RESERVATION_PREFIX)) {
      return { success: true, free: true };
    }
    try {
      const { data, error } = await supabase.functions.invoke('credit-commit', {
        body: { reservation_id, actual_cost }
      });

      if (error) throw error;
      if (!data.success) {
        throw new Error(data.error || 'Failed to commit credits');
      }

      return data;
    } catch (error) {
      console.error('Credit commit failed:', error);
      throw error;
    }
  };

  const refund = async (reservation_id: string, reason?: string) => {
    if (reservation_id.startsWith(FREE_RESERVATION_PREFIX)) {
      return { success: true, free: true };
    }
    try {
      const { data, error } = await supabase.functions.invoke('credit-refund', {
        body: { reservation_id, reason }
      });

      if (error) throw error;
      if (!data.success) {
        throw new Error(data.error || 'Failed to refund credits');
      }

      return data;
    } catch (error) {
      console.error('Credit refund failed:', error);
      throw error;
    }
  };

  return {
    loading,
    checkPreflight,
    reserve,
    commit,
    refund
  };
};
