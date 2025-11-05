import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { trackAIJobEvent, trackRateLimitHit } from '../_shared/telemetry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { eventType, metadata } = await req.json();
    const jobId = 'test-job-' + Date.now();
    
    console.log(`[Test] Sending test ${eventType} event to PostHog...`);

    // Handle different event types
    switch (eventType) {
      case 'ai_job_queued':
        await trackAIJobEvent(
          'queued',
          jobId,
          metadata?.jobType || 'campaign-generation',
          metadata?.userId || 'test-user-id',
          {
            goal: metadata?.goal || 'Test Campaign Goal',
            topic: metadata?.topic || 'Test Topic',
            duration_weeks: metadata?.duration_weeks || 4,
            platforms: metadata?.platforms || ['instagram', 'facebook'],
            post_frequency: metadata?.post_frequency || 3,
            test: true
          }
        );
        break;

      case 'ai_job_started':
        await trackAIJobEvent(
          'started',
          jobId,
          metadata?.jobType || 'campaign-generation',
          metadata?.userId || 'test-user-id',
          {
            started_at: new Date().toISOString(),
            test: true
          }
        );
        break;

      case 'ai_job_completed':
        await trackAIJobEvent(
          'completed',
          jobId,
          metadata?.jobType || 'campaign-generation',
          metadata?.userId || 'test-user-id',
          {
            duration_ms: metadata?.duration_ms || 5000,
            result_count: metadata?.result_count || 10,
            test: true
          }
        );
        break;

      case 'ai_job_failed':
        await trackAIJobEvent(
          'failed',
          jobId,
          metadata?.jobType || 'campaign-generation',
          metadata?.userId || 'test-user-id',
          {
            error_message: metadata?.error_message || 'Test error message',
            retry_count: metadata?.retry_count || 1,
            will_retry: metadata?.will_retry || false,
            test: true
          }
        );
        break;

      case 'rate_limit_hit':
        await trackRateLimitHit(
          metadata?.userId || 'test-user-id',
          metadata?.planCode || 'free',
          metadata?.functionName || 'test-function',
          metadata?.retryAfter || 60
        );
        break;

      default:
        throw new Error(`Unknown event type: ${eventType}`);
    }

    console.log(`[Test] Successfully sent test ${eventType} event to PostHog`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Test ${eventType} event sent to PostHog`,
        event_type: eventType,
        job_id: jobId,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[Test] Error sending test event:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
