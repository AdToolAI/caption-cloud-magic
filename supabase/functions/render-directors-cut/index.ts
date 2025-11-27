import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Premium feature credit costs
const PREMIUM_CREDITS = {
  styleTransfer: 5,
  colorGrading: 3,
  upscaling: 10,
  interpolation: 8,
  restoration: 15,
  objectRemoval: 10,
  autoCut: 3,
  soundDesign: 5,
  beatSync: 2,
  smartCrop: 5,
  chromaKey: 3,
  transitions: 2,
  speedRamping: 2,
};

// Credit pricing based on duration, quality, and premium features
function calculateCredits(
  durationSeconds: number, 
  quality: string,
  premiumFeatures: {
    styleTransfer?: boolean;
    colorGrading?: boolean;
    upscaling?: boolean;
    interpolation?: boolean;
    restoration?: boolean;
    objectRemoval?: boolean;
    autoCut?: boolean;
    soundDesign?: boolean;
    beatSync?: boolean;
    smartCrop?: boolean;
    chromaKey?: boolean;
    transitions?: boolean;
    speedRamping?: boolean;
  } = {}
): number {
  let baseCredits: number;
  
  if (durationSeconds < 30) {
    baseCredits = 10;
  } else if (durationSeconds < 60) {
    baseCredits = 20;
  } else if (durationSeconds < 180) {
    baseCredits = 50;
  } else if (durationSeconds < 300) {
    baseCredits = 100;
  } else {
    baseCredits = 200;
  }
  
  // Quality multiplier
  const qualityMultiplier = quality === '4k' ? 2 : 1;
  let totalCredits = baseCredits * qualityMultiplier;
  
  // Add premium feature costs
  if (premiumFeatures.styleTransfer) totalCredits += PREMIUM_CREDITS.styleTransfer;
  if (premiumFeatures.colorGrading) totalCredits += PREMIUM_CREDITS.colorGrading;
  if (premiumFeatures.upscaling) totalCredits += PREMIUM_CREDITS.upscaling;
  if (premiumFeatures.interpolation) totalCredits += PREMIUM_CREDITS.interpolation;
  if (premiumFeatures.restoration) totalCredits += PREMIUM_CREDITS.restoration;
  if (premiumFeatures.objectRemoval) totalCredits += PREMIUM_CREDITS.objectRemoval;
  if (premiumFeatures.autoCut) totalCredits += PREMIUM_CREDITS.autoCut;
  if (premiumFeatures.soundDesign) totalCredits += PREMIUM_CREDITS.soundDesign;
  if (premiumFeatures.beatSync) totalCredits += PREMIUM_CREDITS.beatSync;
  if (premiumFeatures.smartCrop) totalCredits += PREMIUM_CREDITS.smartCrop;
  if (premiumFeatures.chromaKey) totalCredits += PREMIUM_CREDITS.chromaKey;
  if (premiumFeatures.transitions) totalCredits += PREMIUM_CREDITS.transitions;
  if (premiumFeatures.speedRamping) totalCredits += PREMIUM_CREDITS.speedRamping;
  
  return totalCredits;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { 
      project_id,
      source_video_url,
      effects,
      audio_settings,
      export_settings,
      voiceover_url,
      background_music_url,
      duration_seconds,
      // Premium features
      style_transfer,
      color_grading,
      speed_keyframes,
      chroma_key,
      transitions,
      scenes,
      sound_design,
      upscaling,
      interpolation,
      restoration,
      object_removal,
      auto_cut,
      beat_sync,
      smart_crop,
    } = await req.json();

    if (!source_video_url) {
      return new Response(JSON.stringify({ error: 'Missing source_video_url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[RenderDirectorsCut] Starting render for user ${user.id}, project ${project_id}`);

    const duration = duration_seconds || 30;
    const quality = export_settings?.quality || 'hd';
    const format = export_settings?.format || 'mp4';

    // Determine which premium features are enabled
    const premiumFeatures = {
      styleTransfer: style_transfer?.enabled || false,
      colorGrading: color_grading?.enabled || false,
      upscaling: upscaling?.enabled || false,
      interpolation: interpolation?.enabled || false,
      restoration: restoration?.enabled || false,
      objectRemoval: object_removal?.enabled || false,
      autoCut: auto_cut?.enabled || false,
      soundDesign: sound_design?.enabled || false,
      beatSync: beat_sync?.enabled || false,
      smartCrop: smart_crop?.enabled || false,
      chromaKey: chroma_key?.enabled || false,
      transitions: transitions && transitions.length > 0,
      speedRamping: speed_keyframes && speed_keyframes.length > 0,
    };

    // Calculate credits with premium features
    const creditsNeeded = calculateCredits(duration, quality, premiumFeatures);

    // Check user credits
    const { data: wallet, error: walletError } = await supabaseClient
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(JSON.stringify({ error: 'Wallet not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (wallet.balance < creditsNeeded) {
      return new Response(JSON.stringify({ 
        error: 'INSUFFICIENT_CREDITS',
        message: `Du benötigst ${creditsNeeded} Credits, hast aber nur ${wallet.balance}.`,
        credits_needed: creditsNeeded,
        credits_available: wallet.balance,
      }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create render job record with all premium features
    const { data: renderJob, error: renderError } = await supabaseClient
      .from('video_renders')
      .insert({
        user_id: user.id,
        project_id,
        template_id: null,
        status: 'queued',
        config: {
          sourceVideoUrl: source_video_url,
          effects,
          audioSettings: audio_settings,
          exportSettings: export_settings,
          voiceoverUrl: voiceover_url,
          backgroundMusicUrl: background_music_url,
          durationSeconds: duration,
          // Premium features config
          styleTransfer: style_transfer,
          colorGrading: color_grading,
          speedKeyframes: speed_keyframes,
          chromaKey: chroma_key,
          transitions,
          scenes,
          soundDesign: sound_design,
          upscaling,
          interpolation,
          restoration,
          objectRemoval: object_removal,
          autoCut: auto_cut,
          beatSync: beat_sync,
          smartCrop: smart_crop,
          premiumFeatures,
        },
        credits_used: creditsNeeded,
      })
      .select()
      .single();

    if (renderError) {
      console.error('[RenderDirectorsCut] Error creating render job:', renderError);
      throw new Error('Failed to create render job');
    }

    // Deduct credits
    const { error: deductError } = await supabaseClient.rpc('deduct_credits', {
      p_user_id: user.id,
      p_amount: creditsNeeded,
    });

    if (deductError) {
      console.error('[RenderDirectorsCut] Error deducting credits:', deductError);
      // Rollback render job
      await supabaseClient.from('video_renders').delete().eq('id', renderJob.id);
      throw new Error('Failed to deduct credits');
    }

    // Calculate dimensions based on aspect ratio and quality
    let width: number, height: number;
    const aspectRatio = export_settings?.aspect_ratio || '16:9';
    
    if (quality === '4k') {
      if (aspectRatio === '9:16') {
        width = 2160; height = 3840;
      } else if (aspectRatio === '1:1') {
        width = 2160; height = 2160;
      } else {
        width = 3840; height = 2160;
      }
    } else {
      if (aspectRatio === '9:16') {
        width = 1080; height = 1920;
      } else if (aspectRatio === '1:1') {
        width = 1080; height = 1080;
      } else {
        width = 1920; height = 1080;
      }
    }

    // Update render job to processing
    await supabaseClient
      .from('video_renders')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', renderJob.id);

    // Invoke Remotion Lambda via render-with-remotion function with all premium features
    const { data: renderResult, error: invokeError } = await supabaseClient.functions.invoke(
      'render-with-remotion',
      {
        body: {
          render_id: renderJob.id,
          project_id,
          component_name: 'DirectorsCutVideo',
          input_props: {
            // Source video
            sourceVideoUrl: source_video_url,
            // Basic effects
            brightness: effects?.brightness || 100,
            contrast: effects?.contrast || 100,
            saturation: effects?.saturation || 100,
            sharpness: effects?.sharpness || 0,
            temperature: effects?.temperature || 0,
            vignette: effects?.vignette || 0,
            filter: effects?.filter,
            // Style Transfer
            styleTransfer: style_transfer?.enabled ? {
              enabled: true,
              style: style_transfer.style,
              intensity: style_transfer.intensity || 0.8,
            } : undefined,
            // Color Grading
            colorGrading: color_grading?.enabled ? {
              enabled: true,
              grade: color_grading.grade,
              intensity: color_grading.intensity || 0.8,
            } : undefined,
            // Speed Ramping
            speedKeyframes: speed_keyframes,
            // Chroma Key
            chromaKey: chroma_key?.enabled ? {
              enabled: true,
              color: chroma_key.color,
              tolerance: chroma_key.tolerance || 50,
              edgeSoftness: chroma_key.edge_softness || 0,
              spillSuppression: chroma_key.spill_suppression || 0,
              backgroundUrl: chroma_key.background_url,
            } : undefined,
            // Transitions
            transitions: transitions,
            // Scenes
            scenes: scenes,
            // Audio settings
            masterVolume: audio_settings?.master_volume || 100,
            noiseReduction: audio_settings?.noise_reduction || false,
            voiceEnhancement: audio_settings?.voice_enhancement || false,
            voiceoverUrl: voiceover_url,
            voiceoverVolume: audio_settings?.voiceover_volume || 100,
            backgroundMusicUrl: background_music_url,
            backgroundMusicVolume: audio_settings?.background_music_volume || 30,
            // Sound Design
            soundDesign: sound_design?.enabled ? {
              enabled: true,
              ambientUrl: sound_design.ambient_url,
              ambientVolume: sound_design.ambient_volume || 20,
              sfxTracks: sound_design.sfx_tracks || [],
            } : undefined,
            // Upscaling
            upscaling: upscaling?.enabled ? {
              enabled: true,
              targetResolution: upscaling.target_resolution || '4k',
            } : undefined,
            // Frame Interpolation
            interpolation: interpolation?.enabled ? {
              enabled: true,
              targetFps: interpolation.target_fps || 60,
            } : undefined,
            // Duration and dimensions
            durationInSeconds: duration,
            targetWidth: width,
            targetHeight: height,
          },
          duration_seconds: duration,
          target_width: width,
          target_height: height,
          output_format: format,
        },
      }
    );

    if (invokeError) {
      console.error('[RenderDirectorsCut] Render invocation error:', invokeError);
      // Update render job to failed and refund credits
      await supabaseClient
        .from('video_renders')
        .update({ 
          status: 'failed', 
          error_message: invokeError.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', renderJob.id);
      
      // Refund credits
      await supabaseClient.rpc('increment_balance', {
        p_user_id: user.id,
        p_amount: creditsNeeded,
      });
      
      throw new Error(`Render failed: ${invokeError.message}`);
    }

    console.log(`[RenderDirectorsCut] Render job created: ${renderJob.id}`);

    return new Response(JSON.stringify({
      ok: true,
      render_id: renderJob.id,
      credits_used: creditsNeeded,
      estimated_time_seconds: duration * 2, // Rough estimate
      message: 'Rendering gestartet. Du wirst benachrichtigt, wenn das Video fertig ist.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[RenderDirectorsCut] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
