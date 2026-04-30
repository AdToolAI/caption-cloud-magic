import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { DEFAULT_BUCKET_NAME } from "../_shared/aws-lambda.ts";
import { detectQaServiceAuth } from "../_shared/qaServiceAuth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock, x-qa-real-spend, x-qa-user-id',
};

// ── MP4 duration probe ─────────────────────────────────────────────
// Reads only the first ~512 KB of the file and parses the `mvhd` atom from
// the `moov` box. Works for nearly all MP4s where moov is at the start.
// If moov is at the end (some encoders), falls back to a Range request near EOF.
async function probeMp4Duration(url: string): Promise<number | null> {
  if (!url || !url.startsWith('http')) return null;
  try {
    let dur = await tryProbeRange(url, 0, 512 * 1024 - 1);
    if (dur != null) return dur;
    const head = await fetch(url, { method: 'HEAD' });
    const len = Number(head.headers.get('content-length') || 0);
    if (len > 0) {
      const start = Math.max(0, len - 512 * 1024);
      dur = await tryProbeRange(url, start, len - 1);
      if (dur != null) return dur;
    }
  } catch (e) {
    console.warn('[probeMp4Duration] error:', e);
  }
  return null;
}

async function tryProbeRange(url: string, start: number, end: number): Promise<number | null> {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  return parseMvhdDuration(buf);
}

function parseMvhdDuration(buf: Uint8Array): number | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const readU32 = (o: number) => view.getUint32(o);
  const readU64 = (o: number) => Number(view.getBigUint64(o));

  function walk(offset: number, end: number): number | null {
    let p = offset;
    while (p + 8 <= end) {
      let size = readU32(p);
      const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
      let headerSize = 8;
      if (size === 1) {
        if (p + 16 > end) return null;
        size = readU64(p + 8);
        headerSize = 16;
      }
      if (size < headerSize || p + size > end) return null;
      if (type === 'mvhd') {
        const boxStart = p + headerSize;
        const version = buf[boxStart];
        let timescale: number, duration: number;
        if (version === 1) {
          timescale = readU32(boxStart + 4 + 8 + 8);
          duration = readU64(boxStart + 4 + 8 + 8 + 4);
        } else {
          timescale = readU32(boxStart + 4 + 4 + 4);
          duration = readU32(boxStart + 4 + 4 + 4 + 4);
        }
        if (timescale > 0) return duration / timescale;
        return null;
      }
      if (type === 'moov' || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl') {
        const inner = walk(p + headerSize, p + size);
        if (inner != null) return inner;
      }
      p += size;
    }
    return null;
  }
  try {
    return walk(0, buf.byteLength);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth (with QA service-auth shortcut for Bond QA Deep Sweep)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    const qaSvc = detectQaServiceAuth(req);
    let user: { id: string };
    if (qaSvc.isQaService && qaSvc.userId) {
      user = { id: qaSvc.userId };
      console.log(`[compose-video-assemble] QA service-auth user=${user.id}`);
    } else {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user: jwtUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !jwtUser) throw new Error('Unauthorized');
      user = jwtUser;
    }

    const { projectId, aspectOverride, exportId } = await req.json();
    if (!projectId) throw new Error('projectId is required');
    // Allowed override values match mediaProfilePresets aspect strings
    const ALLOWED_ASPECTS = new Set(['16:9', '9:16', '1:1', '4:5']);
    const aspectOverrideValid = aspectOverride && ALLOWED_ASPECTS.has(aspectOverride) ? aspectOverride : null;

    console.log('[compose-video-assemble] Starting assembly for project:', projectId);

    // 1. Load project
    const { data: project, error: projectError } = await supabase
      .from('composer_projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) throw new Error('Project not found');

    // 2. Load scenes (incl. Block R subject_track for Smart Reframe crop)
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

    // 5. Determine dimensions from aspect ratio (with optional preset override)
    const aspectRatio = aspectOverrideValid || briefing.aspectRatio || '16:9';
    let width = 1920, height = 1080;
    if (aspectRatio === '9:16') { width = 1080; height = 1920; }
    else if (aspectRatio === '1:1') { width = 1080; height = 1080; }
    else if (aspectRatio === '4:5') { width = 1080; height = 1350; }
    if (aspectOverrideValid) {
      console.log('[compose-video-assemble] Aspect override applied:', aspectOverrideValid, `→ ${width}x${height}`);
    }

    // 6. Build Remotion input props — pass DB transition choice through to renderer
    const ALLOWED_TRANSITIONS = new Set(['none', 'fade', 'crossfade', 'wipe', 'slide', 'zoom']);

    // ── Image vs Video detection ────────────────────────────────────
    // AI-image scenes (e.g. *.png from gemini/flux) must NOT be probed as MP4
    // (would fail) and must be flagged so the renderer routes them through
    // <KenBurnsImage> instead of <Video> (which crashes with "Code 4 - Media
    // playback error" on a PNG URL).
    const isImageScene = (s: any) =>
      s?.clip_source === 'ai-image' ||
      s?.upload_type === 'image' ||
      /\.(png|jpe?g|webp|avif|gif)(\?|$)/i.test(s?.clip_url || '');

    // ── Probe REAL mp4 durations to prevent rubber-band stretching ──
    // Hailuo & co. report nominal durations (e.g. "7s") but produce 5.875s files at 24fps.
    // <TransitionSeries.Sequence durationInFrames={210}> would then stretch the 5.875s
    // video to 7s → visible speed warp at every transition. Probe each clip's real
    // duration via mp4 mvhd box parsing and pass it to the renderer so it can clamp.
    // Image scenes are skipped entirely — they have no decoded duration.
    const probedDurations = await Promise.all(
      (scenes || []).map(async (s: any) => {
        if (isImageScene(s)) return null;
        try {
          const dur = await probeMp4Duration(s.clip_url);
          if (dur && dur > 0) {
            console.log(`[probe] scene ${s.order_index}: nominal=${s.duration_seconds}s real=${dur.toFixed(3)}s`);
            return dur;
          }
        } catch (e) {
          console.warn(`[probe] failed for scene ${s.order_index}:`, e);
        }
        return null;
      })
    );

    // ── PER-SCENE TEXT OVERLAY GATE (2026-04-23) ──
    // The legacy `text_overlay` DB column is only honored when the global
    // `textOverlaysEnabled` toggle is on. Otherwise we drop it so the renderer
    // never burns in storyboard-generated hooks/CTAs the user disabled.
    const overlaysFeatureEnabled = assemblyConfig?.textOverlaysEnabled !== false;

    // ── Block R: Smart Reframe — compute objectPosition track per scene ──
    // The DB stores subject_track as { source_aspect, points: [{t,x,y,conf}] }
    // measured against the original (master) frame. When exporting to a
    // different aspect we project the same x,y into the new canvas — but the
    // renderer only needs `objectPosition` (CSS), which is a per-axis 0..1
    // value. With `objectFit: 'cover'`, the axis that is overscanned is the
    // one that varies; the other axis is locked at 0.5. We pre-compute the
    // active axis (horizontal vs vertical) by comparing source vs target
    // aspect ratio and emit a normalized position-track.
    const aspectToNum = (a: string): number => {
      const [w, h] = a.split(':').map(Number);
      return (w && h) ? w / h : 16 / 9;
    };
    const targetAspectNum = aspectToNum(aspectRatio);
    const smartReframeOn = (project as any).smart_reframe_enabled !== false;

    const buildPositionTrack = (
      track: any,
      sceneDuration: number,
    ): Array<{ t: number; xPct: number; yPct: number }> | null => {
      if (!smartReframeOn || !track) return null;
      const points = Array.isArray(track.points) ? track.points : [];
      if (points.length === 0) return null;

      const sourceAspectNum = aspectToNum(track.source_aspect || '16:9');
      // Within ±2% the aspect is essentially identical → no smart reframe needed
      if (Math.abs(sourceAspectNum - targetAspectNum) < 0.02) return null;

      // When source is wider than target → letterboxed horizontally → vary X
      // When source is taller than target → letterboxed vertically → vary Y
      const varyX = sourceAspectNum > targetAspectNum;
      return points
        .filter((p: any) => Number.isFinite(Number(p.t)) && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
        .map((p: any) => {
          const t = Math.max(0, Math.min(sceneDuration, Number(p.t)));
          const x = Math.max(0, Math.min(1, Number(p.x)));
          const y = Math.max(0, Math.min(1, Number(p.y)));
          return {
            t,
            xPct: varyX ? x : 0.5,
            yPct: varyX ? 0.5 : y,
          };
        })
        .sort((a: any, b: any) => a.t - b.t);
    };

    const remotionScenes = (scenes || []).map((s: any, idx: number) => {
      const rawType = (s.transition_type || 'fade').toString().toLowerCase();
      const transitionType = ALLOWED_TRANSITIONS.has(rawType) ? rawType : 'fade';
      const transitionDuration = Number.isFinite(Number(s.transition_duration))
        ? Math.max(0, Number(s.transition_duration))
        : 0.4;
      const nominalDuration = s.duration_seconds || 5;
      const sceneIsImage = isImageScene(s);
      const realDuration = probedDurations[idx];
      // Use REAL video duration if available — this is the single most important
      // anti-rubber-band fix. Without it, Sequence/Video length mismatch causes
      // Remotion to time-warp the video. Image scenes always use nominal duration.
      const effectiveDuration = sceneIsImage
        ? nominalDuration
        : (realDuration && realDuration > 0 ? realDuration : nominalDuration);

      const overlayText = (s.text_overlay?.text || '').trim();
      const includeOverlay = overlaysFeatureEnabled && overlayText.length > 0;

      const positionTrack = buildPositionTrack(s.subject_track, effectiveDuration);

      return {
        videoUrl: s.clip_url,
        // Flag for the renderer: route through <KenBurnsImage> instead of <Video>.
        isImage: sceneIsImage,
        // Single source of truth: durationSeconds IS the real (probed) length
        // when available. The renderer takes this 1:1 — no further clamping.
        durationSeconds: effectiveDuration,
        textOverlay: includeOverlay ? {
          text: overlayText,
          position: s.text_overlay.position || 'bottom',
          animation: s.text_overlay.animation || 'fade-in',
          fontSize: s.text_overlay.fontSize || 48,
          color: s.text_overlay.color || '#FFFFFF',
          fontFamily: s.text_overlay.fontFamily,
        } : undefined,
        transitionType,
        transitionDuration,
        // Block R: Smart Reframe position-track (only when source≠target aspect)
        positionTrack: positionTrack && positionTrack.length > 0 ? positionTrack : undefined,
        // "With sound / no sound" toggle — when true, the renderer keeps the
        // native AI audio track (Sora/Veo/Kling). Default = false (muted) so
        // legacy projects keep playing silently.
        withAudio: s.with_audio === true,
      };
    });

    // ── UNIFORM CROSSFADE + ONE-TRACK VO POLICY (2026-04-18b) ──
    // Renderer uses <TransitionSeries> with a uniform 15-frame fade between
    // every pair of scenes. Each transition OVERLAPS by `CROSSFADE_FRAMES`,
    // so the composed timeline is shorter than the raw sum of scene frames:
    //   composedFrames = sumSceneFrames - (numScenes - 1) * CROSSFADE_FRAMES
    // Audio runs as a single continuous <Audio> outside TransitionSeries, so
    // the crossfade is acoustically invisible.
    const fps = 30;
    const CROSSFADE_FRAMES = 15;
    const sumSeconds = remotionScenes.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
    const sumSceneFrames = remotionScenes.reduce(
      (acc, s) => acc + Math.max(1, Math.round((s.durationSeconds || 0) * fps)),
      0
    );
    const numTransitions = Math.max(0, remotionScenes.length - 1);
    const transitionOverlapFrames = numTransitions * CROSSFADE_FRAMES;
    let durationInFrames = Math.max(1, sumSceneFrames - transitionOverlapFrames);
    console.log(`[compose-video-assemble] Crossfade geometry: sumSceneFrames=${sumSceneFrames}, transitions=${numTransitions}x${CROSSFADE_FRAMES}f, composed=${durationInFrames} (sumSeconds=${sumSeconds.toFixed(3)})`);

    // Voiceover sync safety net: if a VO duration is recorded and longer than the
    // composed timeline, extend so it plays to completion.
    // VO_LEAD_IN (2026-04-22): account for the 0.4s breath added by the template
    // so the composition is long enough to play the VO to its end.
    const VO_LEAD_IN_SECONDS = 0.4;
    const voDurationSeconds = Number(assemblyConfig?.voiceover?.durationSeconds) || 0;
    if (voDurationSeconds > 0) {
      const voFrames = Math.ceil((voDurationSeconds + VO_LEAD_IN_SECONDS) * fps);
      if (voFrames > durationInFrames) {
        console.log('[compose-video-assemble] Extending duration for VO sync (incl. lead-in):', { videoFrames: durationInFrames, voFrames, leadInSeconds: VO_LEAD_IN_SECONDS });
        durationInFrames = voFrames;
      }
    }

    // Small safety pad (0.15s) for MP3 decoder latency at the very end.
    durationInFrames += Math.ceil(0.15 * fps);


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

    // Watermark passthrough — defaults to disabled
    const wmRaw = (assemblyConfig.watermark ?? {}) as any;
    const ALLOWED_WM_POS = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']);
    const ALLOWED_WM_SIZE = new Set(['small', 'medium', 'large']);
    const watermark = {
      enabled: !!wmRaw.enabled && typeof wmRaw.text === 'string' && wmRaw.text.trim().length > 0,
      text: typeof wmRaw.text === 'string' ? wmRaw.text.slice(0, 80) : '',
      position: ALLOWED_WM_POS.has(wmRaw.position) ? wmRaw.position : 'bottom-right',
      size: ALLOWED_WM_SIZE.has(wmRaw.size) ? wmRaw.size : 'medium',
      opacity: Number.isFinite(Number(wmRaw.opacity))
        ? Math.min(1, Math.max(0.3, Number(wmRaw.opacity)))
        : 0.7,
    };

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
      watermark,
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
        export_id: exportId || null,
      },
    };

    // If this is a preset export, link the render id to the export row
    if (exportId) {
      await supabase
        .from('composer_exports')
        .update({ render_id: renderId, status: 'rendering' })
        .eq('id', exportId)
        .eq('user_id', user.id);
    }

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
      // framesPerLambda: omitted → Lambda default heuristic. With TransitionSeries
      // the composition has no manual overlap stretching, so chunk boundaries are
      // safe to fall anywhere — no decoder lock at scene seams.

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
