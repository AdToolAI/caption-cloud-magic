import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { renderId } = await req.json();

    if (!renderId) {
      throw new Error('renderId is required');
    }

    console.log('[check-explainer-render] Checking status for:', renderId);

    // Get auth header
    const authHeader = req.headers.get('Authorization');

    // Call the check-remotion-progress function
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/check-remotion-progress`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader || `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({ renderId }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[check-explainer-render] Progress check failed:', errorText);
      throw new Error(`Progress check failed: ${errorText}`);
    }

    const result = await response.json();
    console.log('[check-explainer-render] Progress result:', result);

    return new Response(
      JSON.stringify({
        progress: result.progress || 0,
        status: result.status || 'Rendering...',
        done: result.done || false,
        outputUrl: result.outputUrl || result.outputFile || null,
        error: result.error || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[check-explainer-render] Error:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
