import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Credit costs for upscaling - synced with frontend values
const UPSCALE_CREDITS = {
  '2k': 15,
  '4k': 25,
  '8k': 50,
};

// Resolution dimensions mapping
const RESOLUTION_CONFIG = {
  '2k': { width: 2560, height: 1440, scale: 2 },
  '4k': { width: 3840, height: 2160, scale: 4 },
  '8k': { width: 7680, height: 4320, scale: 8 },
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

    // Accept parameters as sent from frontend
    const { 
      video_url, 
      target_resolution = '4k',      // '2k' | '4k' | '8k'
      targetResolution,               // Alternative frontend name
      enhance_details = true,
      enhanceDetails,                 // Alternative frontend name
      denoise_strength = 30,          // 0-100
      denoiseStrength,                // Alternative frontend name
      sharpness_boost = 20,           // 0-100
      sharpnessBoost,                 // Alternative frontend name
    } = await req.json();

    // Use whichever parameter name was sent
    const resolution = targetResolution || target_resolution;
    const enhanceDetail = enhanceDetails ?? enhance_details;
    const denoiseLevel = denoiseStrength ?? denoise_strength;
    const sharpnessLevel = sharpnessBoost ?? sharpness_boost;

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: 'video_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate resolution
    if (!['2k', '4k', '8k'].includes(resolution)) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid target_resolution',
          valid_values: ['2k', '4k', '8k'],
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Upscale] Starting upscale to ${resolution} for user: ${user.id}`);
    console.log(`[Upscale] Settings: enhance=${enhanceDetail}, denoise=${denoiseLevel}, sharpness=${sharpnessLevel}`);

    // Determine credit cost from synced mapping
    const creditCost = UPSCALE_CREDITS[resolution as keyof typeof UPSCALE_CREDITS];
    const resolutionConfig = RESOLUTION_CONFIG[resolution as keyof typeof RESOLUTION_CONFIG];

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
          message: `Du benötigst ${creditCost} Credits für ${resolution.toUpperCase()} Upscaling. Aktuell: ${wallet.balance} Credits.`,
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
              scale: resolutionConfig.scale,
              face_enhance: enhanceDetail,
              denoise_strength: denoiseLevel / 100, // Convert 0-100 to 0-1
              sharpness: sharpnessLevel / 100,      // Convert 0-100 to 0-1
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
              message: `${resolution.toUpperCase()} Upscaling gestartet. Dies kann einige Minuten dauern.`,
              credits_used: creditCost,
              settings: {
                target_resolution: resolution,
                enhance_details: enhanceDetail,
                denoise_strength: denoiseLevel,
                sharpness_boost: sharpnessLevel,
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
        message: `${resolution.toUpperCase()} Upscaling-Job erstellt (Simulation). In Produktion wird Replicate API verwendet.`,
        credits_required: creditCost,
        settings: {
          target_resolution: resolution,
          enhance_details: enhanceDetail,
          denoise_strength: denoiseLevel,
          sharpness_boost: sharpnessLevel,
        },
        estimated_time_minutes: resolution === '8k' ? 20 : resolution === '4k' ? 10 : 5,
        output_info: {
          expected_width: resolutionConfig.width,
          expected_height: resolutionConfig.height,
          scale_factor: resolutionConfig.scale,
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
