import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { trackAIJobEvent } from '../_shared/telemetry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Test] Sending test ai_job_queued event to PostHog...');

    // Send test event
    await trackAIJobEvent(
      'queued',
      'test-job-' + Date.now(),
      'campaign-generation',
      'test-user-id',
      {
        goal: 'Test Campaign Goal',
        topic: 'Test Topic',
        duration_weeks: 4,
        platforms: ['instagram', 'facebook'],
        post_frequency: 3,
        test: true
      }
    );

    console.log('[Test] Successfully sent test event to PostHog');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test ai_job_queued event sent to PostHog',
        event_type: 'ai_job_queued',
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
