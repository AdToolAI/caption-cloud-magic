/**
 * Provider Quota Tracker
 * 
 * Lightweight wrapper to log every external API call (Replicate, Gemini, ElevenLabs, OpenAI, etc.)
 * to the provider_quota_log table. Used by the Provider Health Dashboard and Quota Alerter.
 *
 * Usage:
 *   import { trackProviderCall } from '../_shared/provider-tracker.ts';
 *   const result = await trackProviderCall('replicate', '/predictions', async () => {
 *     return await fetch('https://api.replicate.com/v1/predictions', {...});
 *   });
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export type ProviderName =
  | 'replicate'
  | 'gemini'
  | 'elevenlabs'
  | 'openai'
  | 'aws-lambda'
  | 'lovable-ai'
  | 'resend'
  | 'stripe';

interface TrackOptions {
  endpoint?: string;
  rateLimitTotal?: number;
}

let cachedClient: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (cachedClient) return cachedClient;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  cachedClient = createClient(url, key);
  return cachedClient;
}

/**
 * Wrap an async API call to log success/failure/duration to provider_quota_log.
 * Failures in logging never affect the original call.
 */
export async function trackProviderCall<T>(
  provider: ProviderName,
  endpoint: string,
  fn: () => Promise<T>,
  options: TrackOptions = {}
): Promise<T> {
  const start = Date.now();
  let success = true;
  let statusCode: number | null = null;
  let errorMessage: string | null = null;
  let rateLimitRemaining: number | null = null;

  try {
    const result = await fn();
    // Try to extract rate-limit headers if result is a Response
    if (result instanceof Response) {
      statusCode = result.status;
      success = result.ok;
      const remaining = result.headers.get('x-ratelimit-remaining') ||
                        result.headers.get('ratelimit-remaining');
      if (remaining) rateLimitRemaining = parseInt(remaining, 10);
    }
    return result;
  } catch (err) {
    success = false;
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const duration = Date.now() - start;
    // Fire-and-forget log write
    queueMicrotask(() => {
      try {
        const client = getClient();
        if (!client) return;
        (client.from('provider_quota_log') as any).insert({
          provider,
          endpoint,
          status_code: statusCode,
          success,
          response_time_ms: duration,
          rate_limit_remaining: rateLimitRemaining,
          rate_limit_total: options.rateLimitTotal ?? null,
          error_message: errorMessage,
        }).then(({ error }: { error: any }) => {
          if (error) console.error('[provider-tracker] log failed:', error.message);
        });
      } catch (e) {
        console.error('[provider-tracker] unexpected:', e);
      }
    });
  }
}

/**
 * Log a Lambda render outcome to lambda_health_metrics.
 */
export async function trackLambdaRender(params: {
  renderId?: string;
  jobId?: string;
  status: 'success' | 'failure' | 'timeout' | 'oom';
  durationMs?: number;
  memoryUsedMb?: number;
  memoryLimitMb?: number;
  errorMessage?: string;
  functionName?: string;
}) {
  try {
    const client = getClient();
    if (!client) return;
    await client.from('lambda_health_metrics').insert({
      render_id: params.renderId,
      job_id: params.jobId,
      status: params.status,
      duration_ms: params.durationMs,
      memory_used_mb: params.memoryUsedMb,
      memory_limit_mb: params.memoryLimitMb,
      error_message: params.errorMessage,
      function_name: params.functionName,
    });
  } catch (e) {
    console.error('[lambda-tracker] log failed:', e);
  }
}

/**
 * Read current system_config value (with fallback default).
 */
export async function getSystemConfig<T = unknown>(key: string, fallback: T): Promise<T> {
  try {
    const client = getClient();
    if (!client) return fallback;
    const { data } = await client
      .from('system_config')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    return (data?.value as T) ?? fallback;
  } catch {
    return fallback;
  }
}
