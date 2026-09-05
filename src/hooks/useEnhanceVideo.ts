import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { EnhanceConfig } from '@/config/videoEnhanceModels';

/**
 * The single client entry point for video enhancement.
 *
 * Every surface (AI Video Studio, media library, Motion Studio, Director's
 * Cut, Universal Content Creator) uses this hook — there is no per-surface
 * service and no second pricing path.
 */

export interface EnhanceRunRow {
  id: string;
  status: string;
  model_id: string;
  mode: string;
  resolution: string;
  fps: number;
  tier: string;
  user_price_eur: number;
  output_url: string | null;
  output_asset_id: string | null;
  source_url: string;
  error_code: string | null;
  error_message: string | null;
}

export interface EnhanceEstimate {
  userPriceEur: number;
  fps: number;
  outputSeconds: number;
  costUnverified: boolean;
  rateCardVersion: string;
}

export interface EnhanceSource {
  assetId?: string;
  /** Which table the asset lives in — the server must never have to guess. */
  assetType?: 'generation' | 'creation';
  url?: string;
}

const TERMINAL = ['completed', 'provider_failed', 'provider_cancelled_confirmed', 'manual_review'];
const POLL_INTERVAL_MS = 5_000;

async function callEngine(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('video-enhance', { body });
  if (error) {
    const details =
      typeof (error as { context?: { text?: () => Promise<string> } }).context?.text === 'function'
        ? await (error as { context: { text: () => Promise<string> } }).context.text()
        : error.message;
    throw new Error(details);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useEnhanceVideo() {
  const [run, setRun] = useState<EnhanceRunRow | null>(null);
  const [estimate, setEstimate] = useState<EnhanceEstimate | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  /** Authoritative price preview — the server measures the source itself. */
  const previewPrice = useCallback(
    async (source: EnhanceSource, config: EnhanceConfig) => {
      setError(null);
      try {
        const data = await callEngine({
          action: 'estimate',
          sourceAssetId: source.assetId,
          sourceUrl: source.url,
          ...config,
        });
        const pricing = data?.pricing;
        if (!pricing) return null;
        const next: EnhanceEstimate = {
          userPriceEur: pricing.userPriceEur,
          fps: pricing.fps,
          outputSeconds: pricing.outputSeconds,
          costUnverified: pricing.costUnverified,
          rateCardVersion: pricing.rateCardVersion,
        };
        setEstimate(next);
        return next;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [],
  );

  const pollUntilDone = useCallback(
    (runId: string) => {
      stopPolling();
      pollRef.current = window.setInterval(async () => {
        try {
          const data = await callEngine({ action: 'status', runId });
          if (data?.run) {
            setRun(data.run);
            if (TERMINAL.includes(data.run.status)) stopPolling();
          }
        } catch {
          // A polling hiccup is not a verdict — keep polling.
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  /**
   * Starts a run. The idempotency key makes double clicks, network retries and
   * parallel calls collapse into exactly one run and one reservation.
   */
  const startEnhance = useCallback(
    async (source: EnhanceSource, config: EnhanceConfig, idempotencyKey?: string) => {
      setIsStarting(true);
      setError(null);
      try {
        const key = idempotencyKey ?? crypto.randomUUID();
        const data = await callEngine({
          action: 'start',
          idempotencyKey: key,
          sourceAssetId: source.assetId,
          sourceUrl: source.url,
          ...config,
        });
        if (data?.run) {
          setRun(data.run);
          if (!TERMINAL.includes(data.run.status)) pollUntilDone(data.run.id);
        }
        return data?.run as EnhanceRunRow | undefined;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return undefined;
      } finally {
        setIsStarting(false);
      }
    },
    [pollUntilDone],
  );

  /** Records a cancel wish. Money only moves when the provider confirms. */
  const cancelEnhance = useCallback(async (runId: string) => {
    try {
      await callEngine({ action: 'cancel', runId });
      const data = await callEngine({ action: 'status', runId });
      if (data?.run) setRun(data.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setRun(null);
    setEstimate(null);
    setError(null);
  }, [stopPolling]);

  return {
    run,
    estimate,
    isStarting,
    isRunning: !!run && !TERMINAL.includes(run.status),
    error,
    previewPrice,
    startEnhance,
    cancelEnhance,
    reset,
  };
}
