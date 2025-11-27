import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Credit costs for upscaling
const UPSCALE_CREDITS = {
  '720p_to_1080p': 5,
  '1080p_to_4k': 10,
  '720p_to_4k': 15,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { 
      video_url, 
      source_resolution = '1080p',
      target_resolution = '4k',
      enhance_details = true,
      denoise = true,
    } = await req.json();

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: 'video_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Upscale] Starting upscale: ${source_resolution} → ${target_resolution} for user: ${user.id}`);

    // Determine credit cost
    const upscaleKey = `${source_resolution}_to_${target_resolution}`;
    const creditCost = UPSCALE_CREDITS[upscaleKey as keyof typeof UPSCALE_CREDITS] || 10;

    // Check user credits
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: 'Could not retrieve wallet' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (wallet.balance < creditCost) {
      return new Response(
        JSON.stringify({ 
          error: 'INSUFFICIENT_CREDITS',
          message: `Du benötigst ${creditCost} Credits für dieses Upscaling. Aktuell: ${wallet.balance} Credits.`,
          required: creditCost,
          available: wallet.balance,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for Replicate API key for actual upscaling
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');

    if (REPLICATE_API_KEY) {
      // Use Replicate for actual video upscaling
      try {
        const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${REPLICATE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // Using a video upscaling model
            version: 'dadc276a9062240e68f110ca06f8cb8d222e43a4a0eb89571f68baf6c7d8e0e4',
            input: {
              video: video_url,
              scale: target_resolution === '4k' ? 4 : 2,
              face_enhance: enhance_details,
              denoise_strength: denoise ? 0.5 : 0,
            },
          }),
        });

        if (replicateResponse.ok) {
          const prediction = await replicateResponse.json();

          // Deduct credits
          await supabaseAdmin
            .from('wallets')
            .update({ 
              balance: wallet.balance - creditCost,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id);

          return new Response(
            JSON.stringify({
              success: true,
              job_id: prediction.id,
              status: 'processing',
              message: 'Upscaling gestartet. Dies kann einige Minuten dauern.',
              credits_used: creditCost,
              settings: {
                source_resolution,
                target_resolution,
                enhance_details,
                denoise,
              },
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (replicateError) {
        console.error('[Upscale] Replicate error:', replicateError);
        // Fall through to simulation
      }
    }

    // Simulation mode when Replicate is not available
    console.log('[Upscale] Running in simulation mode');

    // Simulate job creation
    const jobId = crypto.randomUUID();

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        status: 'simulated',
        message: 'Upscaling-Job erstellt (Simulation). In Produktion wird Replicate API verwendet.',
        credits_required: creditCost,
        settings: {
          source_resolution,
          target_resolution,
          enhance_details,
          denoise,
        },
        estimated_time_minutes: target_resolution === '4k' ? 10 : 5,
        output_info: {
          expected_width: target_resolution === '4k' ? 3840 : 1920,
          expected_height: target_resolution === '4k' ? 2160 : 1080,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Upscale] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
