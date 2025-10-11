import { useCallback } from 'react';
import { emitEvent, AppEvent } from '@/lib/eventBus';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook for emitting application events
 * Provides a consistent interface for event emission with error handling and retry logic
 */
export function useEventEmitter() {
  const { toast } = useToast();

  const emit = useCallback(async (event: AppEvent, options?: { 
    showError?: boolean;
    silent?: boolean;
    retry?: boolean;
  }) => {
    const operation = async () => {
      const result = await emitEvent(event);
      if (!result.success) {
        throw new Error(result.error || 'Failed to emit event');
      }
      return result;
    };

    try {
      let result;
      
      if (options?.retry) {
        // Use manual retry logic with exponential backoff
        const maxAttempts = 3;
        const baseDelay = 500;
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            result = await operation();
            break;
          } catch (error) {
            lastError = error as Error;
            
            if (attempt < maxAttempts - 1) {
              const delay = baseDelay * Math.pow(2, attempt);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }

        if (!result) {
          throw lastError || new Error('Failed after retries');
        }
      } else {
        // Regular emission without retry
        result = await operation();
      }

      if (!options?.silent) {
        console.log(`Event emitted: ${event.event_type}`, event.payload);
      }

      return result;
    } catch (error) {
      if (options?.showError) {
        toast({
          title: 'Event Error',
          description: error instanceof Error ? error.message : 'Failed to record activity',
          variant: 'destructive',
        });
      }
      
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }, [toast]);

  return { emit };
}
