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
  /** Measured on the finished file — authoritative over any projection. */
  actual_width?: number | null;
  actual_height?: number | null;
  output_codec?: string | null;
  output_bitrate_kbps?: number | null;
  output_size_bytes?: number | null;
  output_container?: string | null;
  output_fps?: number | null;
  output_duration_seconds?: number | null;
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

/**
 * Engine rejection with its machine-readable code, so surfaces can show a
 * localized sentence instead of the raw server text (or raw JSON).
 */
export interface EngineFailure {
  message: string;
  code: string | null;
  /** Sub-reason for a code, e.g. `downscale` | `no_op` for a rejected upscale. */
  reason: string | null;
  /** Server-measured source facts sent along with a rejection, when present. */
  source: Partial<ServerSourceMeta> | null;
}

export class EnhanceEngineError extends Error {
  code: string | null;
  reason: string | null;
  source: Partial<ServerSourceMeta> | null;
  constructor(message: string, code: string | null, reason: string | null = null, source: Partial<ServerSourceMeta> | null = null) {
    super(message);
    this.name = 'EnhanceEngineError';
    this.code = code;
    this.reason = reason;
    this.source = source;
  }
}

function sourceFromPayload(value: unknown): Partial<ServerSourceMeta> | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.width !== 'number' || typeof v.height !== 'number') return null;
  return {
    width: v.width,
    height: v.height,
    durationSeconds: typeof v.durationSeconds === 'number' ? v.durationSeconds : undefined,
    fps: typeof v.fps === 'number' ? v.fps : undefined,
    container: typeof v.container === 'string' ? v.container : undefined,
    sizeBytes: typeof v.sizeBytes === 'number' ? v.sizeBytes : undefined,
    sourceModel: typeof v.sourceModel === 'string' ? v.sourceModel : undefined,
  };
}

function parseEngineFailure(text: string): EngineFailure {
  try {
    const parsed = JSON.parse(text) as { error?: unknown; code?: unknown; reason?: unknown; source?: unknown };
    if (parsed && typeof parsed === 'object') {
      return {
        message: typeof parsed.error === 'string' && parsed.error ? parsed.error : text,
        code: typeof parsed.code === 'string' ? parsed.code : null,
        reason: typeof parsed.reason === 'string' ? parsed.reason : null,
        source: sourceFromPayload(parsed.source),
      };
    }
  } catch {
    // plain text body
  }
  return { message: text, code: null, reason: null, source: null };
}

async function callEngine(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('video-enhance', { body });
  if (error) {
    let text = error.message;
    const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
    if (typeof ctx?.text === 'function') {
      try {
        text = await ctx.text();
      } catch {
        // keep the client message
      }
    }
    const failure = parseEngineFailure(text);
    throw new EnhanceEngineError(failure.message, failure.code, failure.reason, failure.source);
  }
  if (data?.error) {
    throw new EnhanceEngineError(
      String(data.error),
      typeof data.code === 'string' ? data.code : null,
      typeof data.reason === 'string' ? data.reason : null,
      sourceFromPayload(data.source),
    );
  }
  return data;
}

function failureOf(e: unknown): EngineFailure {
  if (e instanceof EnhanceEngineError) {
    return { message: e.message, code: e.code, reason: e.reason, source: e.source };
  }
  return { message: e instanceof Error ? e.message : String(e), code: null, reason: null, source: null };
}

/** Server-measured facts, authoritative over anything the client read. */
export interface ServerSourceMeta {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  container?: string;
  sizeBytes?: number;
  sourceModel?: string;
}

export function useEnhanceVideo() {
  const [run, setRun] = useState<EnhanceRunRow | null>(null);
  const [estimate, setEstimate] = useState<EnhanceEstimate | null>(null);
  const [sourceMeta, setSourceMeta] = useState<ServerSourceMeta | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Machine-readable engine code (e.g. VIDEO_ENHANCE_NOT_AN_UPSCALE) for localized copy. */
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const clearFailure = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  const recordFailure = useCallback((e: unknown) => {
    const failure = failureOf(e);
    setError(failure.message);
    setErrorCode(failure.code);
  }, []);

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
      clearFailure();
      try {
        const data = await callEngine({
          action: 'estimate',
          sourceAssetId: source.assetId,
          sourceAssetType: source.assetType,
          sourceUrl: source.url,
          ...config,
        });
        if (data?.source) setSourceMeta(data.source as ServerSourceMeta);
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
        recordFailure(e);
        return null;
      }
    },
    [clearFailure, recordFailure],
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
      clearFailure();
      try {
        const key = idempotencyKey ?? crypto.randomUUID();
        const data = await callEngine({
          action: 'start',
          idempotencyKey: key,
          sourceAssetId: source.assetId,
          sourceAssetType: source.assetType,
          sourceUrl: source.url,
          ...config,
        });
        if (data?.run) {
          setRun(data.run);
          if (!TERMINAL.includes(data.run.status)) pollUntilDone(data.run.id);
        }
        return data?.run as EnhanceRunRow | undefined;
      } catch (e) {
        recordFailure(e);
        return undefined;
      } finally {
        setIsStarting(false);
      }
    },
    [pollUntilDone, clearFailure, recordFailure],
  );

  /** Records a cancel wish. Money only moves when the provider confirms. */
  const cancelEnhance = useCallback(async (runId: string) => {
    try {
      await callEngine({ action: 'cancel', runId });
      const data = await callEngine({ action: 'status', runId });
      if (data?.run) setRun(data.run);
    } catch (e) {
      recordFailure(e);
    }
  }, [recordFailure]);

  const reset = useCallback(() => {
    stopPolling();
    setRun(null);
    setEstimate(null);
    setSourceMeta(null);
    clearFailure();
  }, [stopPolling, clearFailure]);

  return {
    run,
    estimate,
    sourceMeta,
    isStarting,
    isRunning: !!run && !TERMINAL.includes(run.status),
    error,
    errorCode,
    previewPrice,
    startEnhance,
    cancelEnhance,
    reset,
  };
}
