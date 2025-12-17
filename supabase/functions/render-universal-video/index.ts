import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { renderMediaOnLambda } from "npm:@remotion/lambda-client@4.0.392";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { script, briefing, voiceoverUrl, musicUrl, userId } = await req.json();

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
      return acc + (scene.duration || 5);
    }, 0);
    const durationInFrames = Math.ceil(totalDuration * fps);

    console.log(`[render-universal-video] Duration: ${totalDuration}s, Frames: ${durationInFrames}`);

    // Transform scenes to Remotion format
    const remotionScenes = script.scenes.map((scene: any, index: number) => {
      const startTime = script.scenes.slice(0, index).reduce((acc: number, s: any) => acc + (s.duration || 5), 0);
      
      return {
        id: `scene-${index}`,
        type: scene.type || 'content',
        title: scene.title || '',
        subtitle: scene.subtitle || '',
        spokenText: scene.voiceover || '',
        visualDescription: scene.visualDescription || '',
        duration: scene.duration || 5,
        startTime,
        endTime: startTime + (scene.duration || 5),
        background: {
          type: scene.imageUrl ? 'image' : 'gradient',
          imageUrl: scene.imageUrl,
          gradientColors: briefing.brandColors || ['#3b82f6', '#1e40af'],
        },
        animation: scene.animation || 'fadeIn',
        textPosition: scene.textPosition || 'center',
      };
    });

    // Build input props for UniversalCreatorVideo template
    const inputProps = {
      // Category & Structure
      category: briefing.category || 'marketing',
      storytellingStructure: briefing.storytellingStructure || 'problem-solution',
      
      // Content
      title: script.title || briefing.productName || 'Video',
      subtitle: script.subtitle || briefing.tagline || '',
      scenes: remotionScenes,
      
      // Styling
      primaryColor: briefing.brandColors?.[0] || '#3b82f6',
      secondaryColor: briefing.brandColors?.[1] || '#1e40af',
      fontFamily: briefing.fontFamily || 'Inter',
      
      // Audio
      voiceoverUrl: voiceoverUrl || null,
      backgroundMusicUrl: musicUrl || null,
      voiceoverVolume: 1,
      musicVolume: 0.3,
      
      // Subtitles
      showSubtitles: briefing.showSubtitles !== false,
      subtitleStyle: briefing.subtitleStyle || 'modern',
      subtitlePosition: briefing.subtitlePosition || 'bottom',
      subtitleColor: '#ffffff',
      subtitleBackgroundColor: 'rgba(0,0,0,0.7)',
      
      // Features
      showProgressBar: briefing.showProgressBar !== false,
      progressBarColor: briefing.brandColors?.[0] || '#3b82f6',
      showWatermark: briefing.showWatermark === true,
      watermarkText: briefing.watermarkText || '',
      watermarkPosition: 'bottom-right',
      
      // Format
      aspectRatio: briefing.aspectRatio || '16:9',
      targetWidth: dimensions.width,
      targetHeight: dimensions.height,
      fps,
    };

    console.log(`[render-universal-video] InputProps prepared, invoking Lambda...`);

    // Invoke Remotion Lambda
    const webhookUrl = `${supabaseUrl}/functions/v1/remotion-webhook`;

    const response = await renderMediaOnLambda({
      region: 'eu-central-1',
      functionName: 'remotion-render-4-0-377-mem3008mb-disk10240mb-600sec',
      serveUrl: REMOTION_SERVE_URL,
      composition: 'UniversalCreatorVideo',
      inputProps,
      codec: 'h264',
      imageFormat: 'jpeg',
      maxRetries: 2,
      framesPerLambda: 150,
      privacy: 'public',
      webhook: {
        url: webhookUrl,
        secret: null,
      },
      overwrite: true,
      frameRange: [0, durationInFrames - 1],
    });

    console.log(`[render-universal-video] Lambda invoked successfully`);
    console.log(`[render-universal-video] Render ID: ${response.renderId}`);
    console.log(`[render-universal-video] Bucket: ${response.bucketName}`);

    // Create render record
    const { error: renderError } = await supabase
      .from('video_renders')
      .insert({
        render_id: response.renderId,
        bucket_name: response.bucketName,
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
        },
        subtitle_config: {
          enabled: briefing.showSubtitles !== false,
          style: briefing.subtitleStyle || 'modern',
        },
        status: 'rendering',
        started_at: new Date().toISOString(),
        user_id: userId,
      });

    if (renderError) {
      console.error('[render-universal-video] Failed to create render record:', renderError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        renderId: response.renderId,
        bucketName: response.bucketName,
        outputUrl: null, // Will be populated by webhook
        status: 'rendering',
        estimatedDuration: totalDuration,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[render-universal-video] Error:', error);
    
    // Check for Lambda concurrency errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isThrottleError = errorMessage.includes('Rate Exceeded') ||
                           errorMessage.includes('Concurrency limit') ||
                           errorMessage.includes('TooManyRequestsException') ||
                           errorMessage.includes('ThrottlingException');

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
