import { useCallback } from 'react';
import { emitEvent, AppEvent } from '@/lib/eventBus';
import { useToast } from '@/hooks/use-toast';

/**
 * Hook for emitting application events
 * Provides a consistent interface for event emission with error handling
 */
export function useEventEmitter() {
  const { toast } = useToast();

  const emit = useCallback(async (event: AppEvent, options?: { 
    showError?: boolean;
    silent?: boolean;
  }) => {
    const result = await emitEvent(event);

    if (!result.success && options?.showError) {
      toast({
        title: 'Event Error',
        description: result.error || 'Failed to record activity',
        variant: 'destructive',
      });
    }

    if (result.success && !options?.silent) {
      console.log(`Event emitted: ${event.event_type}`, event.payload);
    }

    return result;
  }, [toast]);

  return { emit };
}
