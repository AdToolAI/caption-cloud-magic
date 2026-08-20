/**
 * useAccountType — exposes the account type and the platform-wide AI discount.
 *
 * Creator accounts get a discount on every AI deduction (video, image, music,
 * audio, text). The discount is enforced server-side in the DB deduction
 * functions; this hook only powers the UI (price display + badge).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { discountFactor, normalizeDiscountPercent } from '@/lib/aiDiscount';

export type AccountType = 'standard' | 'creator';

export interface AccountTypeInfo {
  accountType: AccountType;
  discountPercent: number;
  /** Multiply a list price by this to get what the user is actually charged. */
  discountFactor: number;
  isCreator: boolean;
  isLoading: boolean;
}

export function useAccountType(): AccountTypeInfo {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['account-type', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('account_type, ai_discount_percent')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const accountType = (data?.account_type as AccountType) ?? 'standard';
  const discountPercent = normalizeDiscountPercent(data?.ai_discount_percent);

  return {
    accountType,
    discountPercent,
    discountFactor: discountFactor(discountPercent),
    isCreator: accountType === 'creator',
    isLoading,
  };
}
