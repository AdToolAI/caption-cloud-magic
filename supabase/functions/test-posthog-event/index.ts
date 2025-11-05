import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const POSTHOG_API_KEY = Deno.env.get('POSTHOG_API_KEY');
    const POSTHOG_HOST = Deno.env.get('VITE_PUBLIC_POSTHOG_HOST') || 'https://eu.i.posthog.com';
    
    console.log(`[Test] Sending test ${eventType} event to PostHog...`);
    console.log(`[Test] Metadata:`, JSON.stringify(metadata));

    if (!POSTHOG_API_KEY) {
      throw new Error('PostHog API key not configured');
    }

    // Event an PostHog senden
    const response = await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        event: eventType,
        distinct_id: metadata?.userId || `test-user-${Date.now()}`,
        properties: {
          ...metadata,
          $lib: 'edge-function-test'
        },
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Test] PostHog API error: ${response.status}`, errorText);
      throw new Error(`PostHog API error: ${response.status}`);
    }

    console.log(`[Test] Successfully sent test ${eventType} event to PostHog`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Test ${eventType} event sent to PostHog`,
        event_type: eventType,
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
