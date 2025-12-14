import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      scenes,
      voiceoverUrl,
      backgroundMusicUrl,
      backgroundMusicVolume = 0.15,
      style = 'flat-design',
      showSceneTitles = true,
      showProgressBar = true,
      format = { width: 1920, height: 1080, fps: 30 },
      totalDuration,
    } = await req.json();

    console.log('[render-explainer-video] Starting render:', {
      sceneCount: scenes?.length,
      totalDuration,
      format,
      style,
    });

    if (!scenes || scenes.length === 0) {
      throw new Error('No scenes provided');
    }

    // Get auth header for downstream calls
    const authHeader = req.headers.get('Authorization');

    // Call the main render function
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/render-with-remotion`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader || `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({
          component_name: 'ExplainerVideo',
          input_props: {
            scenes: scenes.map((scene: any) => ({
              id: scene.id,
              type: scene.type,
              title: scene.title,
              spokenText: scene.spokenText,
              visualDescription: scene.visualDescription,
              durationSeconds: scene.durationSeconds,
              startTime: scene.startTime,
              endTime: scene.endTime,
              emotionalTone: scene.emotionalTone,
              imageUrl: scene.imageUrl,
              animation: scene.animation || 'fadeIn',
              textAnimation: scene.textAnimation || 'fadeWords',
            })),
            voiceoverUrl,
            backgroundMusicUrl,
            backgroundMusicVolume,
            style,
            primaryColor: '#F5C76A',
            secondaryColor: '#8B5CF6',
            showSceneTitles,
            showProgressBar,
          },
          duration_in_frames: Math.ceil(totalDuration * format.fps),
          fps: format.fps,
          width: format.width,
          height: format.height,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[render-explainer-video] Render call failed:', errorText);
      throw new Error(`Render failed: ${errorText}`);
    }

    const renderResult = await response.json();
    console.log('[render-explainer-video] Render initiated:', renderResult);

    return new Response(
      JSON.stringify({
        ok: true,
        renderId: renderResult.renderId,
        outputUrl: renderResult.outputUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[render-explainer-video] Error:', error);
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
