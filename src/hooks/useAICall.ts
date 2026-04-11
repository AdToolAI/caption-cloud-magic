import { useState } from 'react';
import { toast } from 'sonner';
import { useCreditReservation, ReservationResult } from './useCreditReservation';
import { FeatureCost } from '@/lib/featureCosts';
import { useTranslation } from './useTranslation';

interface AICallOptions {
  featureCode: FeatureCost;
  estimatedCost?: number;
  apiCall: () => Promise<any>;
  rateLimitConfig?: {
    maxRequests: number;
    windowMs: number;
  };
  metadata?: Record<string, any>;
}

interface AICallStatus {
  stage: 'idle' | 'rate_check' | 'credit_check' | 'executing' | 'retrying' | 'success' | 'error';
  message: string;
  retryAttempt?: number;
}

/**
 * Unified hook for AI calls with rate limiting, credit guard, and retry logic
 */
export function useAICall() {
  const [status, setStatus] = useState<AICallStatus>({ stage: 'idle', message: '' });
  const [loading, setLoading] = useState(false);
  const { checkPreflight, reserve, commit, refund } = useCreditReservation();
  const { t } = useTranslation();

  const executeAICall = async <T = any>(options: AICallOptions): Promise<T> => {
    const { featureCode, estimatedCost, apiCall, metadata } = options;
    
    setLoading(true);
    let reservation: ReservationResult | null = null;

    try {
      // Stage 1: Credit Preflight Check
      setStatus({ stage: 'credit_check', message: t('aiCall_checking_credits') });
      
      const preflightResult = await checkPreflight(featureCode, estimatedCost);
      
      if (!preflightResult.allowed) {
        const error: any = new Error(
          t('aiCall_insufficient_credits', { required: preflightResult.required_credits, available: preflightResult.available_balance })
        );
        error.code = 'INSUFFICIENT_CREDITS';
        error.requiredCredits = preflightResult.required_credits;
        error.availableBalance = preflightResult.available_balance;
        throw error;
      }

      // Stage 2: Reserve Credits
      reservation = await reserve(featureCode, estimatedCost, metadata);

      // Stage 3: Execute API Call with basic retry
      setStatus({ stage: 'executing', message: t('aiCall_generating') });
      
      let result: T;
      let lastError: any;
      const maxAttempts = 3;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          result = await apiCall();
          break; // Success
        } catch (error: any) {
          lastError = error;
          
          // Only retry on rate limits or server errors
          if ((error.status === 429 || error.status >= 500) && attempt < maxAttempts) {
            const delay = Math.pow(2, attempt - 1) * 1000;
            setStatus({ 
              stage: 'retrying', 
              message: t('aiCall_retrying', { attempt, max: maxAttempts }),
              retryAttempt: attempt 
            });
            toast.info(t('aiCall_retrying', { attempt, max: maxAttempts }));
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw error;
          }
        }
      }
      
      if (!result!) {
        throw lastError;
      }

      // Stage 4: Commit Credits
      await commit(reservation.reservation_id);

      setStatus({ stage: 'success', message: t('aiCall_success') });
      return result!;

    } catch (error: any) {
      // Refund credits on failure
      if (reservation) {
        await refund(reservation.reservation_id, error.message || 'AI call failed');
      }

      setStatus({ stage: 'error', message: error.message });

      // Handle specific errors
      if (error.code === 'INSUFFICIENT_CREDITS') {
        toast.error(
          t('aiCall_insufficient_credits', { required: error.requiredCredits, available: error.availableBalance }),
          { duration: 5000 }
        );
        throw error;
      }

      if (error.status === 429) {
        toast.error(t('aiCall_rate_limit'));
      } else if (error.status === 402) {
        toast.error(t('aiCall_payment_required'));
      } else if (error.status >= 500) {
        toast.error(t('aiCall_server_error'));
      } else {
        toast.error(error.message || t('aiCall_generic_error'));
      }

      throw error;
    } finally {
      setLoading(false);
      setTimeout(() => {
        setStatus({ stage: 'idle', message: '' });
      }, 2000);
    }
  };

  return {
    executeAICall,
    loading,
    status,
  };
}
