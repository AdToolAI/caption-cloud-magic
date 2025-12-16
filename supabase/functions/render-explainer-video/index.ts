import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ✅ PHASE 3: Multi-Format Export Configuration
const FORMAT_CONFIGS = {
  landscape: { width: 1920, height: 1080, aspect: '16:9' },
  portrait: { width: 1080, height: 1920, aspect: '9:16' },
  square: { width: 1080, height: 1080, aspect: '1:1' },
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
      // ✅ PHASE 3: Multi-Format Export Options
      multiFormat = false,
      formats = ['landscape'], // Can be ['landscape', 'portrait', 'square']
      projectId,
    } = await req.json();

    console.log('[render-explainer-video] Starting render:', {
      sceneCount: scenes?.length,
      totalDuration,
      format,
      style,
      multiFormat,
      formats,
    });

    if (!scenes || scenes.length === 0) {
      throw new Error('No scenes provided');
    }

    // Get auth header for downstream calls
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Prepare base input props
    const baseInputProps = {
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
    };

    // ✅ PHASE 3: Multi-Format Parallel Export
    if (multiFormat && formats.length > 1) {
      console.log('[render-explainer-video] 🎬 Starting multi-format parallel export:', formats);
      
      const renderPromises = formats.map(async (formatKey: string) => {
        const formatConfig = FORMAT_CONFIGS[formatKey as keyof typeof FORMAT_CONFIGS] || FORMAT_CONFIGS.landscape;
        
        console.log(`[render-explainer-video] Starting ${formatKey} render:`, formatConfig);
        
        try {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/render-with-remotion`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader || `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              },
              body: JSON.stringify({
                component_name: 'ExplainerVideo',
                input_props: baseInputProps,
                duration_in_frames: Math.ceil(totalDuration * format.fps),
                fps: format.fps,
                width: formatConfig.width,
                height: formatConfig.height,
              }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[render-explainer-video] ${formatKey} render failed:`, errorText);
            return { format: formatKey, success: false, error: errorText };
          }

          const result = await response.json();
          console.log(`[render-explainer-video] ✅ ${formatKey} render initiated:`, result.renderId);
          
          return {
            format: formatKey,
            aspect: formatConfig.aspect,
            success: true,
            renderId: result.renderId,
            outputUrl: result.outputUrl,
          };
        } catch (err) {
          console.error(`[render-explainer-video] ${formatKey} render error:`, err);
          return { format: formatKey, success: false, error: err instanceof Error ? err.message : String(err) };
        }
      });

      // Wait for all renders to start (not complete - they run async)
      const renderResults = await Promise.all(renderPromises);
      
      // Store multi-format render status in database if projectId provided
      if (projectId) {
        await supabase
          .from('explainer_generation_progress')
          .update({
            multi_format_renders: renderResults,
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId);
      }

      console.log('[render-explainer-video] 🎬 Multi-format renders initiated:', renderResults);

      return new Response(
        JSON.stringify({
          ok: true,
          multiFormat: true,
          renders: renderResults,
          totalFormats: formats.length,
          successCount: renderResults.filter(r => r.success).length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Single format render (original behavior)
    const response = await fetch(
      `${supabaseUrl}/functions/v1/render-with-remotion`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader || `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({
          component_name: 'ExplainerVideo',
          input_props: baseInputProps,
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
