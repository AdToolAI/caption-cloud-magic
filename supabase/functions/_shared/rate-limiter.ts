/**
 * Rate Limiter for Production Scaling (1000+ Users)
 * Backend-based, database-backed rate limiting with plan-based limits
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface RateLimitConfig {
  ai_calls_per_minute: number;
  concurrent_ai_jobs: number;
  api_calls_per_minute: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  remaining?: number;
}

interface ConcurrentJobsResult {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number;
}

export class RateLimiter {
  private supabase: SupabaseClient;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    this.supabase = createClient(
      supabaseUrl || Deno.env.get('SUPABASE_URL')!,
      supabaseKey || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }

  /**
   * Check AI call rate limit using leaky bucket algorithm
   */
  async checkAICallLimit(
    userId: string,
    workspaceId: string | null,
    planCode: string
  ): Promise<RateLimitResult> {
    // Get plan limits
    const { data: planLimits } = await this.supabase
      .from('plan_rate_limits')
      .select('ai_calls_per_minute')
      .eq('plan_code', planCode)
      .single();

    if (!planLimits) {
      console.error(`[RateLimiter] Plan not found: ${planCode}`);
      return { allowed: false, retryAfter: 60 };
    }

    const maxTokens = planLimits.ai_calls_per_minute;
    const windowMs = 60000; // 1 minute

    const entityId = workspaceId || userId;
    const entityType = workspaceId ? 'workspace' : 'user';

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);

    // Get or create rate limit state
    let { data: state } = await this.supabase
      .from('rate_limit_state')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('limit_type', 'ai_calls')
      .gte('window_end', now.toISOString())
      .maybeSingle();

    if (!state) {
      // Create new window
      await this.supabase.from('rate_limit_state').insert({
        entity_type: entityType,
        entity_id: entityId,
        limit_type: 'ai_calls',
        tokens_remaining: maxTokens - 1,
        window_start: windowStart.toISOString(),
        window_end: now.toISOString(),
        last_refill_at: now.toISOString()
      });

      return { allowed: true, remaining: maxTokens - 1 };
    }

    // Refill tokens (leaky bucket)
    const timeSinceRefill = now.getTime() - new Date(state.last_refill_at).getTime();
    const refillRate = maxTokens / windowMs;
    const tokensToAdd = Math.floor(timeSinceRefill * refillRate);
    const newTokens = Math.min(maxTokens, state.tokens_remaining + tokensToAdd);

    // Check if request can proceed
    if (newTokens < 1) {
      const timeUntilToken = Math.ceil((1 - newTokens) / refillRate);
      return {
        allowed: false,
        retryAfter: Math.ceil(timeUntilToken / 1000),
        remaining: 0
      };
    }

    // Deduct token
    await this.supabase
      .from('rate_limit_state')
      .update({
        tokens_remaining: newTokens - 1,
        last_refill_at: now.toISOString()
      })
      .eq('id', state.id);

    return { allowed: true, remaining: newTokens - 1 };
  }

  /**
   * Check concurrent AI jobs limit
   */
  async checkConcurrentJobsLimit(
    userId: string,
    workspaceId: string | null,
    planCode: string
  ): Promise<ConcurrentJobsResult> {
    const { data: planLimits } = await this.supabase
      .from('plan_rate_limits')
      .select('concurrent_ai_jobs')
      .eq('plan_code', planCode)
      .single();

    if (!planLimits) {
      return { allowed: false, currentCount: 0, maxAllowed: 0 };
    }

    const entityId = workspaceId || userId;
    const filterColumn = workspaceId ? 'workspace_id' : 'user_id';

    const { count } = await this.supabase
      .from('active_ai_jobs')
      .select('*', { count: 'exact', head: true })
      .eq(filterColumn, entityId);

    const currentCount = count || 0;
    const allowed = currentCount < planLimits.concurrent_ai_jobs;

    return {
      allowed,
      currentCount,
      maxAllowed: planLimits.concurrent_ai_jobs
    };
  }

  /**
   * Register active AI job
   */
  async registerActiveJob(
    userId: string,
    workspaceId: string | null,
    jobId: string,
    jobType: string
  ): Promise<void> {
    await this.supabase.from('active_ai_jobs').insert({
      user_id: userId,
      workspace_id: workspaceId,
      job_id: jobId,
      job_type: jobType
    });
  }

  /**
   * Unregister active AI job
   */
  async unregisterActiveJob(jobId: string): Promise<void> {
    await this.supabase
      .from('active_ai_jobs')
      .delete()
      .eq('job_id', jobId);
  }

  /**
   * Get user's plan code
   */
  async getUserPlan(userId: string): Promise<string> {
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('plan')
      .eq('id', userId)
      .single();

    return profile?.plan || 'free';
  }
}

/**
 * Middleware wrapper for Edge Functions with rate limiting
 */
export async function withRateLimit(
  req: Request,
  handler: (req: Request, rateLimiter: RateLimiter) => Promise<Response>
): Promise<Response> {
  const rateLimiter = new RateLimiter();

  try {
    // Extract JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await rateLimiter.supabase.auth.getUser(token);

    if (error || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get user's plan
    const planCode = await rateLimiter.getUserPlan(user.id);

    // Extract workspace_id from request body if exists
    let workspaceId: string | null = null;
    try {
      const body = await req.clone().json();
      workspaceId = body.workspace_id || null;
    } catch {
      // No JSON body or parsing failed
    }

    // Check AI call rate limit
    const limitCheck = await rateLimiter.checkAICallLimit(user.id, workspaceId, planCode);

    if (!limitCheck.allowed) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        retry_after_seconds: limitCheck.retryAfter,
        message: `Too many AI calls. Please wait ${limitCheck.retryAfter} seconds.`,
        plan: planCode
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(limitCheck.retryAfter || 60),
          'X-RateLimit-Remaining': '0'
        }
      });
    }

    // Check concurrent jobs limit
    const jobsCheck = await rateLimiter.checkConcurrentJobsLimit(user.id, workspaceId, planCode);

    if (!jobsCheck.allowed) {
      return new Response(JSON.stringify({
        error: 'Too many concurrent AI jobs',
        current_jobs: jobsCheck.currentCount,
        max_allowed: jobsCheck.maxAllowed,
        message: `You have ${jobsCheck.currentCount} active jobs. Maximum: ${jobsCheck.maxAllowed}.`,
        plan: planCode
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Execute handler
    const response = await handler(req, rateLimiter);

    // Add rate limit headers
    response.headers.set('X-RateLimit-Remaining', String(limitCheck.remaining || 0));
    response.headers.set('X-RateLimit-Limit', String(jobsCheck.maxAllowed));

    return response;
  } catch (error: any) {
    console.error('[RateLimit] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
