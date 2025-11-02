/**
 * PostHog Telemetry for Edge Functions
 * Tracks performance metrics, errors, and business events
 */

const POSTHOG_API_KEY = Deno.env.get('VITE_PUBLIC_POSTHOG_KEY');
const POSTHOG_HOST = 'https://eu.i.posthog.com';

interface TelemetryEvent {
  event: string;
  properties: Record<string, any>;
  distinctId?: string;
}

/**
 * Send event to PostHog
 */
export async function trackEvent(event: TelemetryEvent): Promise<void> {
  if (!POSTHOG_API_KEY) {
    console.warn('[Telemetry] PostHog not configured, skipping event:', event.event);
    return;
  }

  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        event: event.event,
        properties: {
          ...event.properties,
          timestamp: new Date().toISOString(),
          environment: Deno.env.get('ENVIRONMENT') || 'production'
        },
        distinct_id: event.distinctId || 'system'
      })
    });
  } catch (error) {
    console.error('[Telemetry] Failed to send event:', error);
  }
}

/**
 * Track Edge Function call metrics
 */
export async function trackEdgeFunctionCall(
  functionName: string,
  durationMs: number,
  success: boolean,
  statusCode: number,
  errorMessage?: string,
  userId?: string
): Promise<void> {
  await trackEvent({
    event: 'edge_fn_call',
    distinctId: userId || 'system',
    properties: {
      function_name: functionName,
      duration_ms: durationMs,
      success,
      status_code: statusCode,
      error_message: errorMessage || null,
      p95_threshold_exceeded: durationMs > 800,
      p99_threshold_exceeded: durationMs > 2000
    }
  });
}

/**
 * Track AI Job events
 */
export async function trackAIJobEvent(
  eventType: 'queued' | 'started' | 'completed' | 'failed',
  jobId: string,
  jobType: string,
  userId: string,
  metadata?: Record<string, any>
): Promise<void> {
  await trackEvent({
    event: `ai_job_${eventType}`,
    distinctId: userId,
    properties: {
      job_id: jobId,
      job_type: jobType,
      ...metadata
    }
  });
}

/**
 * Track Rate Limit events
 */
export async function trackRateLimitHit(
  userId: string,
  planCode: string,
  functionName: string,
  retryAfter: number
): Promise<void> {
  await trackEvent({
    event: 'rate_limit_hit',
    distinctId: userId,
    properties: {
      plan: planCode,
      function_name: functionName,
      retry_after_seconds: retryAfter
    }
  });
}

/**
 * Track Business Events (conversions, feature usage, etc.)
 */
export async function trackBusinessEvent(
  eventType: string,
  userId: string,
  properties?: Record<string, any>
): Promise<void> {
  await trackEvent({
    event: eventType,
    distinctId: userId,
    properties: properties || {}
  });
}

/**
 * Middleware wrapper for Edge Functions with telemetry
 */
export function withTelemetry(
  functionName: string,
  handler: (req: Request) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    const startTime = Date.now();
    let statusCode = 200;
    let errorMessage: string | undefined;
    let userId: string | undefined;

    try {
      // Extract user ID from Authorization header (if exists)
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        try {
          const token = authHeader.replace('Bearer ', '');
          const payload = JSON.parse(atob(token.split('.')[1]));
          userId = payload.sub;
        } catch {
          // Ignore JWT parsing errors
        }
      }

      const response = await handler(req);
      statusCode = response.status;

      // Track successful call
      const durationMs = Date.now() - startTime;
      await trackEdgeFunctionCall(
        functionName,
        durationMs,
        statusCode < 400,
        statusCode,
        undefined,
        userId
      );

      return response;
    } catch (error: any) {
      statusCode = 500;
      errorMessage = error.message;

      // Track error
      const durationMs = Date.now() - startTime;
      await trackEdgeFunctionCall(
        functionName,
        durationMs,
        false,
        statusCode,
        errorMessage,
        userId
      );

      throw error;
    }
  };
}

/**
 * Combined wrapper: Rate-Limiting + Telemetry
 */
export function withRateLimitAndTelemetry(
  functionName: string,
  handler: (req: Request, context: any) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    const startTime = Date.now();
    
    // Import rate limiter dynamically to avoid circular dependencies
    const { withRateLimit } = await import('./rate-limiter.ts');
    
    return withRateLimit(req, async (req, rateLimiter) => {
      const response = await handler(req, { rateLimiter });
      
      // Track after successful rate limit check
      const durationMs = Date.now() - startTime;
      const userId = req.headers.get('x-user-id'); // Set by rate limiter
      
      await trackEdgeFunctionCall(
        functionName,
        durationMs,
        response.status < 400,
        response.status,
        undefined,
        userId || undefined
      );
      
      return response;
    });
  };
}
