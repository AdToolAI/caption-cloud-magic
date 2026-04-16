import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { projectId } = await req.json();
    if (!projectId) throw new Error('projectId is required');

    console.log('[compose-video-assemble] Starting assembly for project:', projectId);

    // 1. Load project
    const { data: project, error: projectError } = await supabase
      .from('composer_projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) throw new Error('Project not found');

    // 2. Load scenes
    const { data: scenes, error: scenesError } = await supabase
      .from('composer_scenes')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true });

    if (scenesError) throw new Error('Failed to load scenes');

    // 3. Verify each clip is renderable: ready OR upload-with-url
    const isRenderable = (s: any) =>
      (s.clip_status === 'ready' && !!s.clip_url) ||
      (s.clip_source === 'upload' && !!s.upload_url);

    const notReady = (scenes || []).filter(s => !isRenderable(s));
    if (notReady.length > 0) {
      const details = notReady
        .map(s => `Szene ${(s.order_index ?? 0) + 1} (${s.scene_type || 'custom'}, status: ${s.clip_status})`)
        .join(', ');
      throw new Error(`Folgende Szenen sind noch nicht fertig: ${details}. Bitte erst alle Clips generieren.`);
    }

    // Normalize: prefer upload_url for upload-source scenes
    for (const s of (scenes || []) as any[]) {
      if (s.clip_source === 'upload' && !s.clip_url && s.upload_url) {
        s.clip_url = s.upload_url;
      }
    }

    // 4. Parse assembly config
    const assemblyConfig = project.assembly_config || {};
    const briefing = project.briefing || {};

    // 5. Determine dimensions from aspect ratio
    const aspectRatio = briefing.aspectRatio || '16:9';
    let width = 1920, height = 1080;
    if (aspectRatio === '9:16') { width = 1080; height = 1920; }
    else if (aspectRatio === '1:1') { width = 1080; height = 1080; }
    else if (aspectRatio === '4:5') { width = 1080; height = 1350; }

    // 6. Build Remotion input props
    const remotionScenes = (scenes || []).map((s: any) => ({
      videoUrl: s.clip_url,
      durationSeconds: s.duration_seconds || 5,
      textOverlay: s.text_overlay ? {
        text: s.text_overlay.text || '',
        position: s.text_overlay.position || 'bottom',
        animation: s.text_overlay.animation || 'fade-in',
        fontSize: s.text_overlay.fontSize || 48,
        color: s.text_overlay.color || '#FFFFFF',
        fontFamily: s.text_overlay.fontFamily,
      } : undefined,
      transitionType: s.transition_type || assemblyConfig.transitionStyle || 'fade',
      transitionDuration: s.transition_duration || 0.5,
    }));

    const totalDuration = remotionScenes.reduce((sum: number, s: any) => sum + s.durationSeconds, 0);
    const fps = 30;
    const durationInFrames = Math.ceil(totalDuration * fps);

    const inputProps = {
      scenes: remotionScenes,
      colorGrading: assemblyConfig.colorGrading || 'none',
      kineticText: assemblyConfig.kineticText || false,
      voiceoverUrl: assemblyConfig.voiceover?.audioUrl || '',
      backgroundMusicUrl: assemblyConfig.music?.trackUrl || '',
      backgroundMusicVolume: (assemblyConfig.music?.volume || 30) / 100,
      aspectRatio,
    };

    // 7. Create video_renders entry
    const renderId = crypto.randomUUID();
    const { error: renderInsertError } = await supabase
      .from('video_renders')
      .insert({
        render_id: renderId,
        user_id: user.id,
        template_id: 'ComposedAdVideo',
        status: 'pending',
        content_config: {
          composerProjectId: projectId,
          inputProps,
          targetWidth: width,
          targetHeight: height,
          durationInFrames,
          fps,
        },
      });

    if (renderInsertError) {
      console.error('[compose-video-assemble] Failed to create render entry:', renderInsertError);
      throw new Error('Failed to create render entry');
    }

    // 8. Update project status
    await supabase
      .from('composer_projects')
      .update({ status: 'assembling', updated_at: new Date().toISOString() })
      .eq('id', projectId);

    // 9. Build Lambda payload (matches invoke-remotion-render expectations)
    const lambdaPayload = {
      type: 'start',
      serveUrl: Deno.env.get('REMOTION_SERVE_URL') || '',
      composition: 'ComposedAdVideo',
      inputProps,
      codec: 'h264',
      imageFormat: 'jpeg',
      maxRetries: 2,
      privacy: 'public',
      logLevel: 'warn',
      outName: `composer-${projectId}.mp4`,
      frameRange: null,
      scale: 1,
      envVariables: {},
      chromiumOptions: {},
      timeoutInMilliseconds: 600000,
      concurrencyPerLambda: 10,
      downloadBehavior: { type: 'play-in-browser' },
    };

    // 10. Invoke Lambda render
    const { data: renderResult, error: renderError } = await supabase.functions.invoke('invoke-remotion-render', {
      body: {
        lambdaPayload,
        pendingRenderId: renderId,
        userId: user.id,
      },
    });

    if (renderError) {
      console.error('[compose-video-assemble] Render invocation failed:', renderError);
      await supabase
        .from('composer_projects')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', projectId);
      throw new Error('Render invocation failed');
    }

    console.log('[compose-video-assemble] Render started:', renderResult);

    // 11. Deduct credits
    try {
      const totalCost = (scenes || []).reduce((sum: number, s: any) => sum + (s.cost_euros || 0), 0) + 0.10;
      if (totalCost > 0) {
        await supabase.rpc('deduct_ai_video_credits', {
          p_user_id: user.id,
          p_amount: totalCost,
          p_generation_id: renderId,
        });
      }
    } catch (creditErr) {
      console.warn('[compose-video-assemble] Credit deduction failed (non-blocking):', creditErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        renderId,
        lambdaRenderId: renderResult?.lambdaRenderId,
        projectId,
        totalDuration,
        scenesCount: remotionScenes.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[compose-video-assemble] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
