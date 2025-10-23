import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getProvider } from './providers/registry.ts';
import type { Provider, MediaItem, PublishResult } from './providers/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PublishPayload {
  text: string;
  media?: MediaItem[];
  channels: Provider[];
}

interface CachedResponse {
  response: any;
  expiresAt: number;
}

// In-Memory Idempotenz-Cache (60s TTL)
const idempotencyCache = new Map<string, CachedResponse>();

// Cache-Cleanup alle 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of idempotencyCache.entries()) {
    if (value.expiresAt < now) {
      idempotencyCache.delete(key);
    }
  }
}, 60000);

function createIdempotencyKey(payload: PublishPayload, userId: string): string {
  const data = JSON.stringify({ ...payload, userId });
  const encoder = new TextEncoder();
  const dataArray = encoder.encode(data);
  
  let hash = 0;
  for (let i = 0; i < dataArray.length; i++) {
    hash = ((hash << 5) - hash) + dataArray[i];
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return hash.toString(36);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Orchestrator] Incoming publish request');

    // 1. Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[Orchestrator] Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Orchestrator] User authenticated:', user.id);

    // 2. Validate payload
    const payload: PublishPayload = await req.json();

    if (!payload.text || !payload.channels || payload.channels.length === 0) {
      return new Response(
        JSON.stringify({ error: 'text and channels are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Orchestrator] Publishing to channels:', payload.channels);

    // 3. Idempotency check
    const idempotencyKey = createIdempotencyKey(payload, user.id);
    const cached = idempotencyCache.get(idempotencyKey);

    if (cached && cached.expiresAt > Date.now()) {
      console.log('[Orchestrator] Returning cached response');
      return new Response(
        JSON.stringify(cached.response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Save job
    const { data: job, error: jobError } = await supabase
      .from('publish_jobs')
      .insert({
        user_id: user.id,
        text_content: payload.text,
        media: payload.media || [],
        channels: payload.channels,
      })
      .select()
      .single();

    if (jobError || !job) {
      console.error('[Orchestrator] Failed to create job:', jobError);
      throw new Error('Failed to create publish job');
    }

    console.log('[Orchestrator] Job created:', job.id);

    // 5. Publish to all providers in parallel
    const publishTasks = payload.channels.map(async (channel) => {
      const provider = getProvider(channel);

      if (!provider) {
        console.error('[Orchestrator] Provider not found:', channel);
        return {
          provider: channel,
          ok: false,
          error_code: 'PROVIDER_NOT_FOUND',
          error_message: `Provider ${channel} not found`,
        } as PublishResult;
      }

      try {
        console.log(`[Orchestrator] Publishing to ${channel}...`);
        const result = await provider.publish({
          userId: user.id,
          text: payload.text,
          media: payload.media,
        });
        console.log(`[Orchestrator] ${channel} result:`, result.ok ? 'SUCCESS' : 'FAILED');
        return result;
      } catch (error: any) {
        console.error(`[Orchestrator] Provider ${channel} threw error:`, error);
        return {
          provider: channel,
          ok: false,
          error_code: 'PROVIDER_ERROR',
          error_message: error.message || 'Unknown error',
        } as PublishResult;
      }
    });

    const results = await Promise.allSettled(publishTasks);

    // 6. Extract results (never return 500, always ok:false on error)
    const publishResults: PublishResult[] = results.map((result) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error('[Orchestrator] Promise rejected:', result.reason);
        return {
          provider: 'unknown',
          ok: false,
          error_code: 'PROMISE_REJECTED',
          error_message: result.reason?.message || 'Unknown rejection',
        };
      }
    });

    // 7. Save results to database
    const resultsToInsert = publishResults.map((r) => ({
      job_id: job.id,
      provider: r.provider,
      ok: r.ok,
      external_id: r.external_id || null,
      permalink: r.permalink || null,
      error_code: r.error_code || null,
      error_message: r.error_message || null,
    }));

    const { error: resultsError } = await supabase
      .from('publish_results')
      .insert(resultsToInsert);

    if (resultsError) {
      console.error('[Orchestrator] Failed to save results:', resultsError);
    }

    // 8. Build response
    const successCount = publishResults.filter((r) => r.ok).length;
    const totalCount = publishResults.length;

    const response = {
      job_id: job.id,
      results: publishResults,
    };

    // Cache for 60 seconds
    idempotencyCache.set(idempotencyKey, {
      response,
      expiresAt: Date.now() + 60000,
    });

    console.log(`[Orchestrator] Job ${job.id} completed: ${successCount}/${totalCount} successful`);

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[Orchestrator] Fatal error:', error);
    return new Response(
      JSON.stringify({
        error: 'An error occurred processing your request',
        code: 'ORCHESTRATOR_ERROR',
        details: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
