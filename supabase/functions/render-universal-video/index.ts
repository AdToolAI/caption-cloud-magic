import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";
import { normalizeStartPayload, payloadDiagnostics } from "../_shared/remotion-payload.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AWS Lambda configuration (same as render-with-remotion)
const AWS_REGION = 'eu-central-1';
function getLambdaFunctionName(): string {
  const arn = Deno.env.get('REMOTION_LAMBDA_FUNCTION_ARN') || '';
  if (arn.includes(':function:')) return arn.split(':function:')[1] || arn;
  return arn || 'remotion-render-4-0-424-mem3008mb-disk2048mb-600sec';
}
const LAMBDA_FUNCTION_NAME = getLambdaFunctionName();
const DEFAULT_BUCKET_NAME = 'remotionlambda-eucentral1-13gm4o6s90';

// ASCII-safe JSON encoding for Umlaute
function toAsciiSafeJson(jsonString: string): string {
  return jsonString.replace(/[\u0080-\uffff]/g, (char) => {
    const hex = char.charCodeAt(0).toString(16).padStart(4, '0');
    return String.fromCharCode(92) + 'u' + hex;
  });
}

// Shutdown handler for logging
addEventListener('beforeunload', (ev: any) => {
  console.log('[render-universal-video] Function shutdown:', ev.detail?.reason || 'unknown');
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Initialize AWS client
  const aws = new AwsClient({
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    region: AWS_REGION,
  });

  let credits_required = 0;
  let userId: string | null = null;

  try {
    const { 
      script, 
      briefing, 
      voiceoverUrl, 
      musicUrl, 
      userId: bodyUserId,
      subtitles = null,
      phonemeTimestamps = null,
      beatSyncData = null,
    } = await req.json();

    userId = bodyUserId;

    if (!script || !briefing || !userId) {
      throw new Error('Script, briefing, and userId are required');
    }

    console.log(`[render-universal-video] Starting render for user: ${userId}`);
    console.log(`[render-universal-video] Category: ${briefing.category}, Scenes: ${script.scenes?.length}`);

    // Get Remotion configuration
    const REMOTION_SERVE_URL = Deno.env.get('REMOTION_SERVE_URL');
    if (!REMOTION_SERVE_URL) {
      throw new Error('REMOTION_SERVE_URL not configured');
    }

    // Calculate dimensions based on aspect ratio
    const getDimensions = (aspectRatio: string) => {
      const dimensionMap: Record<string, { width: number; height: number }> = {
        '16:9': { width: 1920, height: 1080 },
        '9:16': { width: 1080, height: 1920 },
        '1:1': { width: 1080, height: 1080 },
        '4:5': { width: 1080, height: 1350 },
      };
      return dimensionMap[aspectRatio] || { width: 1920, height: 1080 };
    };

    const dimensions = getDimensions(briefing.aspectRatio || '16:9');
    const fps = 30;

    // Calculate total duration from scenes
    const totalDuration = script.scenes.reduce((acc: number, scene: any) => {
      return acc + (scene.durationSeconds || scene.duration || 5);
    }, 0);
    const durationInFrames = Math.max(30, Math.min(36000, Math.ceil(totalDuration * fps)));

    console.log(`[render-universal-video] Duration: ${totalDuration}s, Frames: ${durationInFrames}`);

    // Transform scenes to Remotion format with FULL animation support
    const remotionScenes = script.scenes.map((scene: any, index: number) => {
      const startTime = script.scenes.slice(0, index).reduce((acc: number, s: any) => 
        acc + (s.durationSeconds || s.duration || 5), 0);
      const duration = scene.durationSeconds || scene.duration || 5;
      const sceneType = scene.sceneType || scene.type || 'content';
      
      return {
        id: `scene-${index}`,
        sceneNumber: scene.sceneNumber || index + 1,
        type: sceneType,
        sceneType: sceneType,
        title: scene.title || '',
        subtitle: scene.subtitle || '',
        spokenText: scene.voiceover || '',
        voiceover: scene.voiceover || '',
        visualDescription: scene.visualDescription || '',
        duration: duration,
        durationSeconds: duration,
        startTime,
        endTime: startTime + duration,
        background: {
          type: scene.imageUrl ? 'image' : 'gradient',
          imageUrl: scene.imageUrl,
          gradientColors: briefing.brandColors || ['#3b82f6', '#1e40af'],
        },
        animation: scene.animation || getDefaultAnimation(sceneType),
        kenBurnsDirection: scene.kenBurnsDirection || 'in',
        textOverlay: {
          enabled: true,
          text: scene.title || '',
          animation: scene.textAnimation || getDefaultTextAnimation(sceneType),
          position: scene.textPosition || 'center',
        },
        textAnimation: scene.textAnimation || getDefaultTextAnimation(sceneType),
        textPosition: scene.textPosition || 'center',
        soundEffect: scene.soundEffect || getDefaultSoundEffect(sceneType),
        soundEffectType: scene.soundEffect || getDefaultSoundEffect(sceneType),
        showCharacter: scene.showCharacter ?? shouldShowCharacter(sceneType),
        characterPosition: scene.characterPosition || getDefaultCharacterPosition(sceneType),
        characterGesture: scene.characterGesture || getDefaultCharacterGesture(sceneType),
        statsOverlay: scene.statsOverlay || null,
        beatAligned: scene.beatAligned ?? (sceneType === 'cta'),
        transition: {
          type: scene.transitionIn || 'fade',
          duration: 0.5,
          direction: 'right',
        },
        transitionIn: scene.transitionIn || 'fade',
        transitionOut: scene.transitionOut || 'fade',
      };
    });

    console.log(`[render-universal-video] Transformed ${remotionScenes.length} scenes`);

    // Build input props for UniversalCreatorVideo template
    const inputProps = {
      category: briefing.category || 'marketing',
      storytellingStructure: briefing.storytellingStructure || 'problem-solution',
      title: script.title || briefing.productName || 'Video',
      subtitle: script.subtitle || briefing.tagline || '',
      scenes: remotionScenes,
      primaryColor: briefing.brandColors?.[0] || '#3b82f6',
      secondaryColor: briefing.brandColors?.[1] || '#1e40af',
      fontFamily: briefing.fontFamily || 'Inter',
      visualStyle: briefing.visualStyle || 'modern-3d',
      voiceoverUrl: voiceoverUrl || null,
      backgroundMusicUrl: musicUrl || null,
      voiceoverVolume: 1,
      musicVolume: 0.3,
      masterVolume: 1,
      useCharacter: briefing.hasCharacter !== false,
      characterType: briefing.characterType || 'lottie',
      characterName: briefing.characterName || 'Assistant',
      phonemeTimestamps: phonemeTimestamps || null,
      enableLipSync: !!phonemeTimestamps,
      showSubtitles: (briefing.showSubtitles !== false) || !!subtitles,
      subtitles: subtitles || [],
      subtitleStyle: {
        position: briefing.subtitlePosition || 'bottom',
        animation: 'highlight',
        outlineStyle: 'glow',
        fontSize: 32,
        fontWeight: 'bold',
      },
      subtitlePosition: briefing.subtitlePosition || 'bottom',
      subtitleColor: '#ffffff',
      subtitleBackgroundColor: 'rgba(0,0,0,0.7)',
      enableSoundEffects: true,
      soundLibraryEnabled: true,
      beatSyncEnabled: !!beatSyncData,
      beatSyncData: beatSyncData || null,
      showProgressBar: briefing.showProgressBar !== false,
      progressBarColor: briefing.brandColors?.[0] || '#3b82f6',
      showWatermark: briefing.showWatermark === true,
      watermarkText: briefing.watermarkText || '',
      watermarkPosition: 'bottom-right',
      defaultAnimation: 'fadeIn',
      enableKenBurns: true,
      enableParallax: true,
      aspectRatio: briefing.aspectRatio || '16:9',
      targetWidth: dimensions.width,
      targetHeight: dimensions.height,
      fps,
      durationInFrames,
      template: 'UniversalCreatorVideo',
      // Phase 3: Lottie Icons enabled — Lambda uses emoji fallbacks automatically
      diag: {
        disableLottieIcons: false,
        disableMorphTransitions: false,
        disableSceneFx: false,
        disableAnimatedText: false,
      },
    };

    // ============================================
    // ✅ CREDIT CHECK & DEDUCTION (ported from render-with-remotion)
    // ============================================
    const voiceoverDuration = totalDuration;
    const calculateCredits = (durationSeconds: number): number => {
      if (durationSeconds < 30) return 10;
      if (durationSeconds <= 60) return 20;
      if (durationSeconds <= 180) return 50;
      if (durationSeconds <= 300) return 100;
      return 200;
    };

    credits_required = calculateCredits(voiceoverDuration);
    console.log(`💰 Credits required: ${credits_required} for ${voiceoverDuration}s video`);

    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (!wallet || wallet.balance < credits_required) {
      return new Response(JSON.stringify({ 
        error: 'Insufficient credits',
        required: credits_required,
        available: wallet?.balance || 0
      }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    await supabase.rpc('deduct_credits', {
      p_user_id: userId,
      p_amount: credits_required
    });
    console.log(`💰 Deducted ${credits_required} credits`);

    // ============================================
    // ✅ CREATE RENDER RECORD
    // ============================================
    const pendingRenderId = `pending-${crypto.randomUUID()}`;
    const webhookUrl = `${supabaseUrl}/functions/v1/remotion-webhook`;
    const bucketName = DEFAULT_BUCKET_NAME;

    const { error: insertError } = await supabase
      .from('video_renders')
      .insert({
        render_id: pendingRenderId,
        bucket_name: bucketName,
        format_config: {
          format: 'mp4',
          aspect_ratio: briefing.aspectRatio || '16:9',
          width: dimensions.width,
          height: dimensions.height,
        },
        content_config: {
          category: briefing.category,
          scenes: remotionScenes.length,
          hasVoiceover: !!voiceoverUrl,
          hasMusic: !!musicUrl,
          credits_used: credits_required,
        },
        subtitle_config: {},
        status: 'rendering',
        started_at: new Date().toISOString(),
        user_id: userId,
      });

    if (insertError) {
      console.error('[render-universal-video] Failed to create render record:', insertError);
      // Refund credits
      await supabase.rpc('increment_balance', { p_user_id: userId, p_amount: credits_required });
      throw new Error(`Failed to create render record: ${insertError.message}`);
    }

    console.log('✅ Created render record:', pendingRenderId);

    // ============================================
    // ✅ DIRECT LAMBDA INVOCATION (no intermediate hop!)
    // ============================================
    const inputPropsJson = JSON.stringify(inputProps);
    const inputPropsForLambda = {
      type: 'payload',
      payload: inputPropsJson,
    };

    const lambdaPayload = normalizeStartPayload({
      type: 'start',
      serveUrl: REMOTION_SERVE_URL,
      composition: 'UniversalCreatorVideo',
      inputProps: inputPropsForLambda,
      durationInFrames,
      fps,
      width: dimensions.width,
      height: dimensions.height,
      codec: 'h264',
      imageFormat: 'jpeg',
      jpegQuality: 80,
      maxRetries: 1,
      timeoutInMilliseconds: 300000,
      privacy: 'public',
      webhook: {
        url: webhookUrl,
        secret: 'remotion-webhook-secret-adtool-2024',
        customData: {
          pending_render_id: pendingRenderId,
          user_id: userId,
          credits_used: credits_required,
          source: 'universal-creator',
        },
      },
    });

    console.log('🔧 Normalized payload diagnostics:', JSON.stringify(payloadDiagnostics(lambdaPayload)));

    const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;

    console.log('🚀 Invoking Lambda DIRECTLY (synchronous RequestResponse)...');

    const rawJson = JSON.stringify(lambdaPayload);
    const asciiSafeJson = toAsciiSafeJson(rawJson);

    const lambdaResponse = await aws.fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: asciiSafeJson,
    });

    console.log('📥 Lambda response status:', lambdaResponse.status);

    if (!lambdaResponse.ok) {
      const errorText = await lambdaResponse.text();
      console.error('❌ Lambda invocation failed:', lambdaResponse.status, errorText);

      // Update render record to failed
      await supabase.from('video_renders').update({
        status: 'failed',
        error_message: `Lambda invocation failed: ${lambdaResponse.status}`,
        completed_at: new Date().toISOString(),
      }).eq('render_id', pendingRenderId);

      // Refund credits
      await supabase.rpc('increment_balance', { p_user_id: userId, p_amount: credits_required });
      console.log(`💰 Refunded ${credits_required} credits due to Lambda error`);

      throw new Error(`Lambda invocation failed with status ${lambdaResponse.status}: ${errorText}`);
    }

    // ✅ Parse synchronous Lambda response
    const lambdaResult = await lambdaResponse.json();
    console.log('✅ Lambda response:', JSON.stringify(lambdaResult, null, 2));

    const realRenderId = lambdaResult.renderId;
    const outputFile = lambdaResult.outputFile;
    const outputBucket = lambdaResult.outBucket || lambdaResult.bucketName || bucketName;

    const outputUrl = outputFile || 
      `https://s3.${AWS_REGION}.amazonaws.com/${outputBucket}/renders/${realRenderId}/out.mp4`;

    console.log('🎬 Real Render ID:', realRenderId);
    console.log('📁 Output URL:', outputUrl);

    // ✅ Update DB with real render data
    const { error: updateError } = await supabase
      .from('video_renders')
      .update({
        status: 'completed',
        video_url: outputUrl,
        completed_at: new Date().toISOString(),
      })
      .eq('render_id', pendingRenderId);

    if (updateError) {
      console.error('⚠️ Failed to update render record:', updateError);
    } else {
      console.log('✅ Render record updated to completed');
    }

    // ✅ Auto-save to Media Library
    try {
      await supabase.from('video_creations').insert({
        user_id: userId,
        title: script.title || briefing.productName || 'Video',
        video_url: outputUrl,
        template_name: 'UniversalCreatorVideo',
        render_engine: 'remotion',
        status: 'completed',
      });

      await supabase.from('media_assets').insert({
        user_id: userId,
        type: 'video',
        original_url: outputUrl,
        storage_path: outputUrl,
        source: 'remotion-render',
      });

      console.log('✅ Saved to Media Library');
    } catch (mediaError) {
      console.warn('⚠️ Media Library save failed (non-critical):', mediaError);
    }

    // ✅ Return completed result
    return new Response(
      JSON.stringify({
        success: true,
        ok: true,
        renderId: pendingRenderId,
        real_render_id: realRenderId,
        video_url: outputUrl,
        bucketName: bucketName,
        outputUrl: outputUrl,
        status: 'completed',
        estimatedDuration: totalDuration,
        features: {
          animations: true,
          textAnimations: true,
          soundEffects: true,
          character: inputProps.useCharacter,
          subtitles: inputProps.showSubtitles,
          beatSync: inputProps.beatSyncEnabled,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[render-universal-video] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isThrottleError = errorMessage.includes('Rate Exceeded') ||
                           errorMessage.includes('Concurrency limit') ||
                           errorMessage.includes('TooManyRequestsException') ||
                           errorMessage.includes('ThrottlingException');

    // Try to refund credits if not already refunded
    if (userId && credits_required > 0) {
      try {
        await supabase.rpc('increment_balance', {
          p_user_id: userId,
          p_amount: credits_required
        });
        console.log(`💰 Refunded ${credits_required} credits due to error`);
      } catch (refundError) {
        console.error('Failed to refund credits:', refundError);
      }
    }

    if (isThrottleError) {
      return new Response(
        JSON.stringify({
          error: 'AWS Render-Kapazität vorübergehend erschöpft. Bitte versuche es in 1-2 Minuten erneut.',
          retryable: true,
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ====== HELPER FUNCTIONS FOR INTELLIGENT DEFAULTS ======

function getDefaultAnimation(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'popIn', 'intro': 'flyIn', 'problem': 'kenBurns',
    'solution': 'morphIn', 'feature': 'parallax', 'benefit': 'slideUp',
    'proof': 'fadeIn', 'testimonial': 'fadeIn', 'cta': 'bounce',
  };
  return map[sceneType] || 'fadeIn';
}

function getDefaultTextAnimation(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'glowPulse', 'intro': 'bounceIn', 'problem': 'typewriter',
    'solution': 'splitReveal', 'feature': 'bounceIn', 'benefit': 'highlight',
    'proof': 'highlight', 'testimonial': 'fadeWords', 'cta': 'waveIn',
  };
  return map[sceneType] || 'fadeWords';
}

function getDefaultSoundEffect(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'whoosh', 'intro': 'whoosh', 'problem': 'alert',
    'solution': 'success', 'feature': 'pop', 'benefit': 'pop',
    'proof': 'success', 'testimonial': 'none', 'cta': 'success',
  };
  return map[sceneType] || 'none';
}

function shouldShowCharacter(sceneType: string): boolean {
  return ['hook', 'problem', 'solution', 'cta', 'intro'].includes(sceneType);
}

function getDefaultCharacterPosition(sceneType: string): string {
  return sceneType === 'problem' ? 'left' : 'right';
}

function getDefaultCharacterGesture(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'pointing', 'intro': 'waving', 'problem': 'thinking',
    'solution': 'celebrating', 'feature': 'pointing', 'benefit': 'celebrating',
    'proof': 'idle', 'testimonial': 'idle', 'cta': 'pointing',
  };
  return map[sceneType] || 'idle';
}
