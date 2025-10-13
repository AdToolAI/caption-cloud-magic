import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface ReservationResult {
  reservation_id: string;
  reserved_amount: number;
  expires_at: string;
}

export const useCreditReservation = () => {
  const [loading, setLoading] = useState(false);

  const checkPreflight = async (feature_code: string, estimated_cost?: number) => {
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
        title: 'Nicht genügend Credits',
        description: 'Bitte kaufen Sie Credits nach, um diese Funktion zu nutzen.',
        variant: 'destructive'
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const commit = async (reservation_id: string, actual_cost?: number) => {
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
