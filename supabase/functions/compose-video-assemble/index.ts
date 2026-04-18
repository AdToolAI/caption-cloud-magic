import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DEFAULT_BUCKET_NAME } from "../_shared/aws-lambda.ts";

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
    const assemblyConfig = (project.assembly_config as any) || {};
    const briefing = (project.briefing as any) || {};

    // 5. Determine dimensions from aspect ratio
    const aspectRatio = briefing.aspectRatio || '16:9';
    let width = 1920, height = 1080;
    if (aspectRatio === '9:16') { width = 1080; height = 1920; }
    else if (aspectRatio === '1:1') { width = 1080; height = 1080; }
    else if (aspectRatio === '4:5') { width = 1080; height = 1350; }

    // 6. Build Remotion input props — pass DB transition choice through to renderer
    const ALLOWED_TRANSITIONS = new Set(['none', 'fade', 'crossfade', 'wipe', 'slide', 'zoom']);
    const remotionScenes = (scenes || []).map((s: any) => {
      const rawType = (s.transition_type || 'fade').toString().toLowerCase();
      const transitionType = ALLOWED_TRANSITIONS.has(rawType) ? rawType : 'fade';
      const transitionDuration = Number.isFinite(Number(s.transition_duration))
        ? Math.max(0, Number(s.transition_duration))
        : 0.4;
      return {
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
        transitionType,
        transitionDuration,
      };
    });

    const fps = 30;
    // IMPORTANT: total duration = sum of original scene durations (NO crossfade shortening).
    // Crossfades are achieved in the renderer by extending each scene's Sequence by the
    // transition overlap, so the audio (VO/music) stays in sync with the visual timeline.
    const sumSeconds = remotionScenes.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
    let durationInFrames = Math.max(1, Math.ceil(sumSeconds * fps));

    // Voiceover sync safety net: if a VO duration is recorded and longer than the
    // composed timeline, extend so it plays to completion.
    const voDurationSeconds = Number(assemblyConfig?.voiceover?.durationSeconds) || 0;
    if (voDurationSeconds > 0) {
      const voFrames = Math.ceil(voDurationSeconds * fps);
      if (voFrames > durationInFrames) {
        console.log('[compose-video-assemble] Extending duration for VO sync:', { videoFrames: durationInFrames, voFrames });
        durationInFrames = voFrames;
      }
    }

    // Small safety pad (0.3s) for MP3 decoder latency at the very end.
    durationInFrames += Math.ceil(0.3 * fps);

    const totalDuration = durationInFrames / fps;

    const subtitlesCfg = assemblyConfig.subtitles || {};
    const textOverlaysEnabled = assemblyConfig.textOverlaysEnabled !== false;
    const globalTextOverlays = textOverlaysEnabled
      ? (Array.isArray(assemblyConfig.globalTextOverlays) ? assemblyConfig.globalTextOverlays : [])
      : [];

    // Strict audio gating: only include URLs when feature is enabled AND URL is set
    const voiceoverEnabled = assemblyConfig.voiceover?.enabled !== false;
    const voiceoverUrl = (voiceoverEnabled && assemblyConfig.voiceover?.audioUrl)
      ? String(assemblyConfig.voiceover.audioUrl)
      : '';
    const musicEnabled = assemblyConfig.music?.enabled !== false;
    const musicUrl = (musicEnabled && assemblyConfig.music?.trackUrl)
      ? String(assemblyConfig.music.trackUrl)
      : '';

    // Sanitize subtitle segments — keep only fields the schema expects
    const cleanSegments = (Array.isArray(subtitlesCfg.segments) ? subtitlesCfg.segments : [])
      .filter((s: any) => s && typeof s.text === 'string' && Number.isFinite(Number(s.startTime)) && Number.isFinite(Number(s.endTime)))
      .map((s: any) => ({
        id: String(s.id || crypto.randomUUID()),
        text: String(s.text),
        startTime: Number(s.startTime),
        endTime: Number(s.endTime),
      }));

    const inputProps = {
      scenes: remotionScenes,
      colorGrading: assemblyConfig.colorGrading || 'none',
      kineticText: assemblyConfig.kineticText || false,
      voiceoverUrl,
      backgroundMusicUrl: musicUrl,
      backgroundMusicVolume: (assemblyConfig.music?.volume || 30) / 100,
      aspectRatio,
      subtitles: {
        enabled: !!subtitlesCfg.enabled,
        language: subtitlesCfg.language || 'de',
        style: subtitlesCfg.style || {},
        segments: cleanSegments,
      },
      globalTextOverlays,
    };

    console.log('[compose-video-assemble] Audio/overlay payload:', {
      voiceoverUrl: voiceoverUrl ? '[set]' : '[empty]',
      backgroundMusicUrl: musicUrl ? '[set]' : '[empty]',
      subtitlesEnabled: !!subtitlesCfg.enabled,
      subtitleSegments: cleanSegments.length,
      globalOverlays: globalTextOverlays.length,
    });

    // 7. Create video_renders entry — match real schema (no template_id!)
    const renderId = crypto.randomUUID();
    const outName = `composer-${projectId}-${Date.now()}.mp4`;
    const bucketName = DEFAULT_BUCKET_NAME;

    const { error: renderInsertError } = await supabase
      .from('video_renders')
      .insert({
        render_id: renderId,
        project_id: projectId,
        user_id: user.id,
        bucket_name: bucketName,
        source: 'composer',
        status: 'pending',
        started_at: new Date().toISOString(),
        format_config: {
          format: 'mp4',
          aspect_ratio: aspectRatio,
          width,
          height,
          fps,
        },
        content_config: {
          composerProjectId: projectId,
          out_name: outName,
          durationInFrames,
          fps,
          width,
          height,
          scenesCount: remotionScenes.length,
          totalDuration,
        },
        subtitle_config: inputProps.subtitles,
      });

    if (renderInsertError) {
      console.error('[compose-video-assemble] Failed to create render entry:', renderInsertError);
      throw new Error(`Failed to create render entry: ${renderInsertError.message}`);
    }

    // 8. Update project status
    await supabase
      .from('composer_projects')
      .update({ status: 'assembling', updated_at: new Date().toISOString() })
      .eq('id', projectId);

    // 9. Build webhook with customData so remotion-webhook can match it
    const webhookUrl = `${supabaseUrl}/functions/v1/remotion-webhook`;
    const webhookData = {
      url: webhookUrl,
      secret: null,
      customData: {
        pending_render_id: renderId,
        out_name: outName,
        user_id: user.id,
        project_id: projectId,
        composer_project_id: projectId,
        source: 'composer',
      },
    };

    const hasAudio = !!inputProps.voiceoverUrl || !!inputProps.backgroundMusicUrl;

    // 10. Build complete Lambda payload
    const lambdaPayload: Record<string, unknown> = {
      type: 'start',
      serveUrl: Deno.env.get('REMOTION_SERVE_URL') || '',
      composition: 'ComposedAdVideo',
      inputProps,
      codec: 'h264',
      imageFormat: 'jpeg',
      maxRetries: 2,
      privacy: 'public',
      logLevel: 'warn',
      outName,
      bucketName,
      width,
      height,
      fps,
      durationInFrames,
      frameRange: [0, durationInFrames - 1],
      muted: !hasAudio,
      audioCodec: 'aac',
      scale: 1,
      envVariables: {},
      chromiumOptions: {},
      timeoutInMilliseconds: 600000,
      concurrencyPerLambda: 1,
      framesPerLambda: 270,
      downloadBehavior: { type: 'play-in-browser' },
      webhook: webhookData,
    };

    // 11. Invoke Lambda render via shared invoker
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
      await supabase
        .from('video_renders')
        .update({ status: 'failed', error_message: `Invocation failed: ${renderError.message}`, completed_at: new Date().toISOString() })
        .eq('render_id', renderId);
      throw new Error(`Render invocation failed: ${renderError.message}`);
    }

    console.log('[compose-video-assemble] Render started:', renderResult);

    // 12. Deduct credits (non-blocking)
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
        lambdaRenderId: (renderResult as any)?.lambdaRenderId || (renderResult as any)?.real_render_id,
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
