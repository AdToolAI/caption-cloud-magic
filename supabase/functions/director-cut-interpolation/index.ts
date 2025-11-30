import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Credit costs for frame interpolation - synced with frontend values
const INTERPOLATION_CREDITS = {
  '24_to_60': 5,
  '24_to_120': 10,
  '24_to_240': 15,
  '25_to_60': 5,
  '25_to_120': 10,
  '25_to_240': 15,
  '30_to_60': 5,
  '30_to_120': 10,
  '30_to_240': 15,
  '60_to_120': 8,
  '60_to_240': 12,
  '120_to_240': 10,
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
      source_fps = 30,
      sourceFps,                       // Alternative frontend name
      target_fps = 60,
      targetFps,                       // Alternative frontend name
      interpolation_mode = 'smooth',   // smooth, fast, film
      interpolationMode,               // Alternative frontend name
    } = await req.json();

    // Use whichever parameter name was sent
    const srcFps = sourceFps ?? source_fps;
    const tgtFps = targetFps ?? target_fps;
    const mode = interpolationMode ?? interpolation_mode;

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: 'video_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Interpolation] Starting: ${srcFps}fps → ${tgtFps}fps for user: ${user.id}`);

    // Validate fps values - extended to support 240 FPS
    const validSourceFps = [24, 25, 30, 60, 120];
    const validTargetFps = [60, 120, 240];

    if (!validSourceFps.includes(srcFps)) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid source_fps',
          valid_values: validSourceFps,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!validTargetFps.includes(tgtFps) || tgtFps <= srcFps) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid target_fps. Must be higher than source_fps.',
          valid_values: validTargetFps.filter(fps => fps > srcFps),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine credit cost
    const interpolationKey = `${srcFps}_to_${tgtFps}`;
    const creditCost = INTERPOLATION_CREDITS[interpolationKey as keyof typeof INTERPOLATION_CREDITS] || 10;

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
          message: `Du benötigst ${creditCost} Credits für Frame Interpolation (${srcFps}→${tgtFps} FPS). Aktuell: ${wallet.balance} Credits.`,
          required: creditCost,
          available: wallet.balance,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Simulation mode - in production would use AI model
    const jobId = crypto.randomUUID();

    // Calculate interpolation factor
    const interpolationFactor = tgtFps / srcFps;

    console.log(`[Interpolation] Job ${jobId} created - Factor: ${interpolationFactor}x, Mode: ${mode}`);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        status: 'processing',
        message: `Frame Interpolation ${srcFps}→${tgtFps} FPS gestartet.`,
        credits_required: creditCost,
        settings: {
          source_fps: srcFps,
          target_fps: tgtFps,
          interpolation_factor: interpolationFactor,
          interpolation_mode: mode,
        },
        estimated_time_minutes: Math.ceil(interpolationFactor * 2),
        info: {
          description: getInterpolationDescription(mode),
          new_frames_per_original: interpolationFactor - 1,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Interpolation] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getInterpolationDescription(mode: string): string {
  switch (mode) {
    case 'smooth':
      return 'Optimiert für flüssige Bewegungen und Sport-Videos';
    case 'fast':
      return 'Schnelle Verarbeitung, leichte Qualitätseinbußen möglich';
    case 'film':
      return 'Bewahrt den Film-Look, ideal für Kino-ähnliche Inhalte';
    default:
      return 'Standard Frame Interpolation';
  }
}
