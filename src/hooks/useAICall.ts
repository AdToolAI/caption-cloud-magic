import { useState } from 'react';
import { toast } from 'sonner';
import { useCreditReservation, ReservationResult } from './useCreditReservation';
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

  const executeAICall = async <T = any>(options: AICallOptions): Promise<T> => {
    const { featureCode, estimatedCost, apiCall, metadata } = options;
    
    setLoading(true);
    let reservation: ReservationResult | null = null;

    try {
      // Stage 1: Credit Preflight Check
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

      // Stage 2: Reserve Credits
      reservation = await reserve(featureCode, estimatedCost, metadata);

      // Stage 3: Execute API Call with basic retry
      setStatus({ stage: 'executing', message: 'Generiere...' });
      
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
            const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
            setStatus({ 
              stage: 'retrying', 
              message: `Wiederhole (${attempt}/${maxAttempts})...`,
              retryAttempt: attempt 
            });
            toast.info(`Wiederhole Anfrage (${attempt}/${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw error; // Don't retry on client errors
          }
        }
      }
      
      if (!result!) {
        throw lastError;
      }

      // Stage 4: Commit Credits
      await commit(reservation.reservation_id);

      setStatus({ stage: 'success', message: 'Erfolgreich!' });
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
  };

  return {
    executeAICall,
    loading,
    status,
  };
}
