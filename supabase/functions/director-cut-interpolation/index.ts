import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Credit costs for frame interpolation
const INTERPOLATION_CREDITS = {
  '30_to_60': 5,
  '30_to_120': 10,
  '24_to_60': 5,
  '60_to_120': 8,
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
      target_fps = 60,
      interpolation_mode = 'smooth', // smooth, fast, film
    } = await req.json();

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: 'video_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Interpolation] Starting: ${source_fps}fps → ${target_fps}fps for user: ${user.id}`);

    // Validate fps values
    const validSourceFps = [24, 25, 30, 60];
    const validTargetFps = [60, 120];

    if (!validSourceFps.includes(source_fps)) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid source_fps',
          valid_values: validSourceFps,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!validTargetFps.includes(target_fps) || target_fps <= source_fps) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid target_fps. Must be higher than source_fps.',
          valid_values: validTargetFps,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine credit cost
    const interpolationKey = `${source_fps}_to_${target_fps}`;
    const creditCost = INTERPOLATION_CREDITS[interpolationKey as keyof typeof INTERPOLATION_CREDITS] || 5;

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
          message: `Du benötigst ${creditCost} Credits für Frame Interpolation. Aktuell: ${wallet.balance} Credits.`,
          required: creditCost,
          available: wallet.balance,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Simulation mode - in production would use AI model
    const jobId = crypto.randomUUID();

    // Calculate interpolation factor
    const interpolationFactor = target_fps / source_fps;

    console.log(`[Interpolation] Job ${jobId} created - Factor: ${interpolationFactor}x`);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        status: 'processing',
        message: 'Frame Interpolation gestartet.',
        credits_required: creditCost,
        settings: {
          source_fps,
          target_fps,
          interpolation_factor: interpolationFactor,
          interpolation_mode,
        },
        estimated_time_minutes: Math.ceil(interpolationFactor * 2),
        info: {
          description: getInterpolationDescription(interpolation_mode),
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
