import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  describeRenderAdmissionError,
  tryParseAdmissionFromInvokeError,
  type RenderAdmissionInfo,
} from '@/lib/render/admission';

/**
 * useEnqueuedRender
 *
 * Thin wrapper around `supabase.functions.invoke` for render entry-points that
 * respect the global Lambda slot budget (`checkRenderAdmission`). If the
 * function returns 429 `RENDER_SLOT_BUSY`, this hook:
 *
 *  1. surfaces a "waiting-for-slot" state to the UI (position/eta unknown but
 *     retry_after_seconds is honoured),
 *  2. automatically re-invokes the same function after the server-suggested
 *     delay (max `maxRetries` attempts, capped total wait ~5 min),
 *  3. resolves with the successful `{ data, error: null }` once a slot opens.
 *
 * All other errors are returned unchanged so callers keep their existing error
 * handling (INSUFFICIENT_CREDITS, INVALID_INPUT, etc.).
 *
 * Founders effectively see this path rarely because the admission guard
 * reserves 10 slots (50→60 high-water) for priority=3 traffic; standard users
 * feel the retry loop first.
 */

export interface WaitingState {
  admission: RenderAdmissionInfo;
  attempt: number;
  maxRetries: number;
  nextRetryAt: number; // epoch ms
}

export interface EnqueuedRenderOptions {
  maxRetries?: number;      // default 6 → up to ~4-5 min of waiting
  maxTotalWaitMs?: number;  // default 5 * 60_000
  showToasts?: boolean;
}

export function useEnqueuedRender(opts: EnqueuedRenderOptions = {}) {
  const { maxRetries = 6, maxTotalWaitMs = 5 * 60_000, showToasts = true } = opts;
  const [waiting, setWaiting] = useState<WaitingState | null>(null);
  const cancelledRef = useRef(false);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setWaiting(null);
  }, []);

  const invoke = useCallback(
    async <T = any>(functionName: string, body: unknown): Promise<{ data: T | null; error: any }> => {
      cancelledRef.current = false;
      const startedAt = Date.now();

      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        if (cancelledRef.current) {
          return { data: null, error: new Error('Cancelled by user') };
        }

        const { data, error } = await supabase.functions.invoke<T>(functionName, { body: body as any });

        // Extract admission info from either invoke error (non-2xx) or data payload.
        let admission: RenderAdmissionInfo | null = null;
        if (error) admission = await tryParseAdmissionFromInvokeError(error);
        if (!admission && data) admission = describeRenderAdmissionError(data);

        if (!admission) {
          setWaiting(null);
          return { data, error };
        }

        // Slot busy → decide whether to keep waiting.
        const elapsed = Date.now() - startedAt;
        const wait = Math.max(5, admission.retryAfterSeconds) * 1000;
        const projectedTotal = elapsed + wait;

        if (attempt > maxRetries || projectedTotal > maxTotalWaitMs) {
          setWaiting(null);
          if (showToasts) toast.warning(admission.message, { duration: 10000 });
          return { data: null, error: { message: admission.message, admission } };
        }

        const nextRetryAt = Date.now() + wait;
        setWaiting({ admission, attempt, maxRetries, nextRetryAt });
        if (showToasts && attempt === 1) {
          toast.info(admission.message, { duration: Math.min(wait, 8000) });
        }

        await new Promise((r) => setTimeout(r, wait));
      }

      setWaiting(null);
      return { data: null, error: new Error('Render slot never became available') };
    },
    [maxRetries, maxTotalWaitMs, showToasts],
  );

  return { invoke, waiting, cancel };
}
