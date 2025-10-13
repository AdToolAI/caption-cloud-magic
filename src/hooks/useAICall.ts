import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useAIRateLimit } from './useAIRateLimit';
import { useCreditReservation, ReservationResult } from './useCreditReservation';
import { useRetry } from './useRetry';
import { FeatureCost } from '@/lib/featureCosts';

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

  const executeAICall = useCallback(async <T = any>(options: AICallOptions): Promise<T> => {
    const { featureCode, estimatedCost, apiCall, rateLimitConfig, metadata } = options;
    
    setLoading(true);
    let reservation: ReservationResult | null = null;

    try {
      // Stage 1: Rate Limit Check
      setStatus({ stage: 'rate_check', message: 'Prüfe Rate Limit...' });
      
      const rateLimit = useAIRateLimit(rateLimitConfig);
      const { allowed, waitTime } = rateLimit.checkRateLimit();
      
      if (!allowed) {
        throw new Error(`Rate limit erreicht. Bitte warte ${waitTime} Sekunden.`);
      }

      // Stage 2: Credit Preflight Check
      setStatus({ stage: 'credit_check', message: 'Prüfe Credits...' });
      
      const preflightResult = await checkPreflight(featureCode, estimatedCost);
      
      if (!preflightResult.allowed) {
        const error: any = new Error(
          `Nicht genügend Credits. Benötigt: ${preflightResult.required_credits}, Verfügbar: ${preflightResult.available_balance}`
        );
        error.code = 'INSUFFICIENT_CREDITS';
        error.requiredCredits = preflightResult.required_credits;
        error.availableBalance = preflightResult.available_balance;
        throw error;
      }

      // Stage 3: Reserve Credits
      reservation = await reserve(featureCode, estimatedCost, metadata);

      // Stage 4: Execute with Retry
      setStatus({ stage: 'executing', message: 'Generiere...' });
      
      const retryOperation = async () => {
        try {
          return await apiCall();
        } catch (error: any) {
          // Only retry on specific errors
          if (error.status === 429 || error.status >= 500) {
            throw error;
          }
          // Don't retry on client errors
          throw error;
        }
      };

      const { executeWithRetry, attempt } = useRetry(retryOperation, {
        maxAttempts: 3,
        delayMs: 1000,
        exponentialBackoff: true,
        onRetry: (attemptNum, error) => {
          setStatus({ 
            stage: 'retrying', 
            message: `Wiederhole (${attemptNum}/3)...`,
            retryAttempt: attemptNum 
          });
          toast.info(`Wiederhole Anfrage (${attemptNum}/3)...`);
        },
      });

      const result = await executeWithRetry();

      // Stage 5: Commit Credits
      await commit(reservation.reservation_id);

      setStatus({ stage: 'success', message: 'Erfolgreich!' });
      return result;

    } catch (error: any) {
      // Refund credits on failure
      if (reservation) {
        await refund(reservation.reservation_id, error.message || 'AI call failed');
      }

      setStatus({ stage: 'error', message: error.message });

      // Handle specific errors
      if (error.code === 'INSUFFICIENT_CREDITS') {
        toast.error(
          `Nicht genügend Credits: ${error.requiredCredits} benötigt, ${error.availableBalance} verfügbar`,
          { duration: 5000 }
        );
        throw error;
      }

      if (error.status === 429) {
        toast.error('Zu viele Anfragen. Bitte versuche es in ein paar Sekunden erneut.');
      } else if (error.status === 402) {
        toast.error('Zahlungspflichtig. Bitte fülle dein Credit-Guthaben auf.');
      } else if (error.status >= 500) {
        toast.error('Server-Fehler. Bitte versuche es später erneut.');
      } else {
        toast.error(error.message || 'Ein Fehler ist aufgetreten');
      }

      throw error;
    } finally {
      setLoading(false);
      // Reset status after 2 seconds
      setTimeout(() => {
        setStatus({ stage: 'idle', message: '' });
      }, 2000);
    }
  }, [checkPreflight, reserve, commit, refund]);

  return {
    executeAICall,
    loading,
    status,
  };
}
