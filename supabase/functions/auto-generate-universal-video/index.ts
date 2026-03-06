import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";
import { normalizeStartPayload, buildStrictMinimalPayload, payloadDiagnostics, calculateFramesPerLambda, calculateScheduling, determineSchedulingMode, type SchedulingMode } from "../_shared/remotion-payload.ts";
import { getLambdaFunctionName, AWS_REGION, DEFAULT_BUCKET_NAME } from "../_shared/aws-lambda.ts";

// r39: Use shared getLambdaFunctionName
function _getLambdaFunctionName(): string {
  return getLambdaFunctionName();
}

// ✅ Schema-valid enum values (must match UniversalCreatorVideoSchema exactly)
const VALID_CATEGORIES = [
  'product-ad', 'social-reel', 'explainer', 'testimonial',
  'tutorial', 'event-promo', 'brand-story', 'educational',
  'announcement', 'behind-scenes', 'comparison', 'showcase',
] as const;
const VALID_STORYTELLING = [
  'hook-problem-solution', 'aida', 'pas', 'hero-journey',
  'before-after', 'three-act', 'listicle', 'day-in-life',
  'challenge', 'transformation',
] as const;
const VALID_SCENE_TYPES = ['hook', 'problem', 'solution', 'feature', 'proof', 'cta', 'intro', 'outro', 'transition'] as const;
const VALID_ANIMATIONS = ['fadeIn', 'slideUp', 'slideLeft', 'slideRight', 'zoomIn', 'zoomOut', 'bounce', 'none', 'kenBurns', 'parallax', 'popIn', 'flyIn', 'morphIn'] as const;
const VALID_KEN_BURNS = ['in', 'out', 'left', 'right', 'up', 'down'] as const;
const VALID_TEXT_ANIMATIONS = ['typewriter', 'fadeWords', 'highlight', 'splitReveal', 'glowPulse', 'bounceIn', 'waveIn', 'none'] as const;
const VALID_TRANSITION_TYPES = ['none', 'fade', 'crossfade', 'slide', 'zoom', 'wipe', 'blur', 'push', 'morph', 'dissolve'] as const;
const VALID_TEXT_POSITIONS = ['top', 'center', 'bottom'] as const;
const VALID_SOUND_EFFECTS = ['whoosh', 'pop', 'success', 'alert', 'none'] as const;
const VALID_STYLES = ['flat-design', 'isometric', 'whiteboard', 'comic', 'corporate', 'modern-3d'] as const;
const VALID_SUBTITLE_ANIMATIONS = ['none', 'fade', 'slide', 'bounce', 'typewriter', 'highlight', 'scaleUp', 'glitch', 'wordByWord'] as const;
const VALID_OUTLINE_STYLES = ['none', 'stroke', 'box', 'box-stroke', 'glow', 'shadow'] as const;

function validateEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (typeof value === 'string' && (allowed as readonly string[]).includes(value)) ? (value as T) : fallback;
}

function deepStripNulls(obj: unknown): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) {
    return obj.map(item => deepStripNulls(item)).filter(item => item !== undefined);
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const cleaned = deepStripNulls(v);
      if (cleaned !== undefined) {
        result[k] = cleaned;
      }
    }
    return result;
  }
  if (typeof obj === 'number' && !isFinite(obj)) return undefined;
  return obj;
}

function stripNulls(obj: Record<string, unknown>): Record<string, unknown> {
  return deepStripNulls(obj) as Record<string, unknown> ?? {};
}

function sanitizeBeatSyncData(data: unknown): { bpm: number; transitionPoints: number[]; downbeats: number[] } | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  const bpm = typeof d.bpm === 'number' && isFinite(d.bpm) ? d.bpm : 0;
  const transitionPoints = Array.isArray(d.transitionPoints) ? d.transitionPoints.filter((v: unknown) => typeof v === 'number' && isFinite(v as number)) : [];
  const downbeats = Array.isArray(d.downbeats) ? d.downbeats.filter((v: unknown) => typeof v === 'number' && isFinite(v as number)) : [];
  if (bpm <= 0) return undefined;
  return { bpm, transitionPoints, downbeats };
}

function toAsciiSafeJson(jsonString: string): string {
  return jsonString.replace(/[\u0080-\uffff]/g, (char) => {
    const hex = char.charCodeAt(0).toString(16).padStart(4, '0');
    return String.fromCharCode(92) + 'u' + hex;
  });
}

function generateRemotionCompatibleId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

addEventListener('beforeunload', (ev: any) => {
  console.log('[auto-generate-universal-video] Function shutdown:', ev.detail?.reason || 'unknown');
});

/**
 * r25: INFRA ERROR CATEGORIES that should trigger render-only retry, never full restart
 */
const INFRA_ERROR_PATTERNS = /rate.?limit|concurrency.?limit|throttl|lambda.?timeout|aws.?concurrency|too many request|429|capacity/i;

function isInfraError(msg: string): boolean {
  return INFRA_ERROR_PATTERNS.test(msg);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { briefing, consultationResult, userId, diagnosticProfile, debugMode, renderOnly, existingProgressId } = await req.json();
    
    const actualBriefing = briefing || consultationResult;
    
    if (!userId) {
      throw new Error('userId is required');
    }
    
    // ═══════════════════════════════════════════════════════════════
    // r25: SERVER-SIDE CIRCUIT BREAKER — check recent failures BEFORE any pipeline start
    // If the user had recent infra errors with existing assets, FORCE renderOnly mode
    // even if the client requests a full pipeline restart.
    // ═══════════════════════════════════════════════════════════════
    let forcedRenderOnly = false;
    let forcedSourceProgressId: string | null = null;
    
    if (!renderOnly && actualBriefing) {
      try {
        // Check: did this user have infra failures in the last 10 minutes?
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: recentFailures } = await supabase
          .from('universal_video_progress')
          .select('id, result_data, status, updated_at')
          .eq('user_id', userId)
          .eq('status', 'failed')
          .gte('updated_at', tenMinAgo)
          .order('updated_at', { ascending: false })
          .limit(5);
        
        if (recentFailures && recentFailures.length > 0) {
          // Count how many full pipeline runs happened recently
          const { data: recentStarts } = await supabase
            .from('universal_video_progress')
            .select('id')
            .eq('user_id', userId)
            .gte('created_at', tenMinAgo);
          
          const totalRecentRuns = recentStarts?.length || 0;
          
          // Find most recent failure with a usable lambdaPayload
          const failureWithPayload = recentFailures.find((f: any) => {
            const rd = f.result_data as any;
            return rd?.lambdaPayload;
          });
          
          if (failureWithPayload && totalRecentRuns >= 2) {
            const rd = failureWithPayload.result_data as any;
            const errorMsg = rd?.errorMessage || '';
            const errorCat = rd?.errorCategory || '';
            
            if (isInfraError(errorMsg) || errorCat === 'rate_limit' || errorCat === 'timeout' || errorCat === 'lambda_crash') {
              console.log(`[auto-generate-universal-video] ⛔ r25 CIRCUIT BREAKER: User ${userId} had ${recentFailures.length} infra failures in 10min, ${totalRecentRuns} total runs. FORCING renderOnly.`);
              forcedRenderOnly = true;
              forcedSourceProgressId = failureWithPayload.id;
            }
          }
          
          // r25: HARD STOP — if user has 5+ failures in 10 min, return capacity_cooldown
          if (recentFailures.length >= 5) {
            console.log(`[auto-generate-universal-video] 🛑 r25 HARD STOP: ${recentFailures.length} failures in 10min for user ${userId}. Returning capacity_cooldown.`);
            return new Response(JSON.stringify({ 
              error: 'capacity_cooldown',
              message: 'Zu viele fehlgeschlagene Versuche. Bitte warte 10 Minuten und versuche es dann erneut.',
              cooldownMinutes: 10,
              failureCount: recentFailures.length,
            }), {
              status: 429,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      } catch (e) {
        console.warn('[auto-generate-universal-video] Circuit breaker check failed (non-fatal):', e);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // r25: If circuit breaker forced renderOnly, redirect to render-only pipeline
    // ═══════════════════════════════════════════════════════════════
    if (forcedRenderOnly && forcedSourceProgressId) {
      console.log(`[auto-generate-universal-video] 🔄 r25: Forced render-only redirect to source: ${forcedSourceProgressId}`);
      
      const { data: existingProgress, error: loadError } = await supabase
        .from('universal_video_progress')
        .select('*')
        .eq('id', forcedSourceProgressId)
        .single();
      
      if (loadError || !existingProgress) {
        console.warn('[auto-generate-universal-video] Could not load forced source progress, falling through to normal pipeline');
      } else {
        const existingResultData = existingProgress.result_data as any;
        if (existingResultData?.lambdaPayload) {
          // Create new progress for the forced render-only attempt
          const { data: newProgress, error: newProgressError } = await supabase
            .from('universal_video_progress')
            .insert({
              user_id: userId,
              category: existingProgress.category,
              status: 'processing',
              current_step: 'rendering',
              progress_percent: 85,
              status_message: '🔄 Server-seitig erzwungener Render-Only Retry — Assets werden wiederverwendet...',
              briefing_json: existingProgress.briefing_json,
            })
            .select()
            .single();
          
          if (!newProgressError && newProgress) {
            const newProgressId = newProgress.id;
            const responseBody = JSON.stringify({ progressId: newProgressId, status: 'started', renderOnly: true, forcedByCircuitBreaker: true });
            
            EdgeRuntime.waitUntil(
              runRenderOnlyPipeline(supabase, newProgressId, existingResultData, userId, existingProgress, 1)
                .catch((err) => {
                  console.error('[auto-generate-universal-video] Forced render-only pipeline error:', err);
                })
            );
            
            return new Response(responseBody, {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // RENDER-ONLY MODE (explicit request or forced by circuit breaker)
    // ═══════════════════════════════════════════════════════════════
    if (renderOnly && existingProgressId) {
      console.log(`[auto-generate-universal-video] 🔄 RENDER-ONLY mode for progress: ${existingProgressId}`);
      
      const { data: existingProgress, error: loadError } = await supabase
        .from('universal_video_progress')
        .select('*')
        .eq('id', existingProgressId)
        .single();
      
      if (loadError || !existingProgress) {
        throw new Error(`Could not load existing progress: ${loadError?.message || 'not found'}`);
      }
      
      const existingResultData = existingProgress.result_data as any;
      if (!existingResultData?.lambdaPayload) {
        throw new Error('Existing progress has no lambdaPayload — full pipeline restart required');
      }
      
      // r34/r37: Count render-only retries for THIS specific chain, using sourceProgressId
      // Chain root = the original progress that generated the assets
      const chainSourceProgressId = (existingResultData as any)?.sourceProgressId || existingProgressId;
      
      const { data: existingRetries } = await supabase
        .from('universal_video_progress')
        .select('id, result_data')
        .eq('user_id', userId)
        .eq('status', 'failed')
        .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());
      
      // Filter to only retries that reference the same chain source
      const relevantRetries = (existingRetries || []).filter((r: any) => {
        const rd = r.result_data;
        return rd?.sourceProgressId === chainSourceProgressId || r.id === chainSourceProgressId;
      });
      const renderOnlyAttempts = relevantRetries.length;
      
      if (renderOnlyAttempts >= 3) {
        console.log(`[auto-generate-universal-video] 🛑 r25: Render-only limit reached (${renderOnlyAttempts}/3)`);
        return new Response(JSON.stringify({
          error: 'capacity_cooldown',
          message: 'Maximale Render-Retries erreicht. Bitte warte einige Minuten.',
          cooldownMinutes: 5,
          renderOnlyAttempts,
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Create NEW progress record for the render-only attempt
      const { data: newProgress, error: newProgressError } = await supabase
        .from('universal_video_progress')
        .insert({
          user_id: userId,
          category: existingProgress.category,
          status: 'processing',
          current_step: 'rendering',
          progress_percent: 85,
          status_message: '🔄 Render-Only Retry — Assets werden wiederverwendet...',
          briefing_json: existingProgress.briefing_json,
        })
        .select()
        .single();
      
      if (newProgressError) {
        throw new Error('Failed to create render-only progress record');
      }
      
      const newProgressId = newProgress.id;
      console.log(`[auto-generate-universal-video] 🔄 Render-only progress: ${newProgressId} (reusing assets from ${existingProgressId}), attempt ${renderOnlyAttempts + 1}`);
      
      const responseBody = JSON.stringify({ progressId: newProgressId, status: 'started', renderOnly: true });
      
      EdgeRuntime.waitUntil(
        runRenderOnlyPipeline(supabase, newProgressId, existingResultData, userId, existingProgress, renderOnlyAttempts + 1)
          .catch((err) => {
            console.error('[auto-generate-universal-video] Render-only pipeline error:', err);
          })
      );
      
      return new Response(responseBody, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (!actualBriefing) {
      throw new Error('Briefing/consultationResult is required');
    }

    const requestedProfile = diagnosticProfile || 'A';

    // BACKEND GUARD: Check last error for this user
    let effectiveProfile = requestedProfile;
    const DIAGNOSTIC_ONLY_PROFILES = ['K', 'L', 'M', 'N', 'O'];
    
    if (DIAGNOSTIC_ONLY_PROFILES.includes(requestedProfile) && !debugMode) {
      effectiveProfile = 'A';
      console.log(`[auto-generate-universal-video] ⛔ Profile ${requestedProfile} blocked (debug-only). Forcing profile A.`);
    }

    try {
      const { data: lastRender } = await supabase
        .from('video_renders')
        .select('error_message, content_config')
        .eq('user_id', userId)
        .eq('status', 'failed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (lastRender?.error_message) {
        const lastError = lastRender.error_message.toLowerCase();
        const lastCategory = (lastRender.content_config as any)?.error_category;
        const isLastRateLimit = lastCategory === 'rate_limit' || 
          /rate exceeded|concurrency limit|throttl/i.test(lastError);
        
        if (isLastRateLimit && requestedProfile !== 'A') {
          effectiveProfile = 'A';
          console.log(`[auto-generate-universal-video] ⛔ Last error was rate_limit. Forcing profile A instead of ${requestedProfile}.`);
        }
      }
    } catch (e) {
      console.warn('[auto-generate-universal-video] Could not check last error:', e);
    }

    console.log(`[auto-generate-universal-video] Starting for user: ${userId}, category: ${actualBriefing.category}, requestedProfile: ${requestedProfile}, effectiveProfile: ${effectiveProfile}`);

    const diagProfile = effectiveProfile;
    const profileDiagFlags: Record<string, Record<string, boolean>> = {
      'A': {},
      'B': { disableMorphTransitions: true },
      'C': { disableLottieIcons: true },
      'D': { disableCharacter: true },
      'E': { disableMorphTransitions: true, disableLottieIcons: true },
      'F': { disableMorphTransitions: true, disableLottieIcons: true, disableCharacter: true },
      'G': { disableAllLottie: true, disableMorphTransitions: true, disableLottieIcons: true, disableCharacter: true },
      'H': { disableAllLottie: true, disableMorphTransitions: true, disableLottieIcons: true, disableCharacter: true, disablePrecisionSubtitles: true },
      'I': { disableAllLottie: true, disableMorphTransitions: true, disableLottieIcons: true, disableCharacter: true, disablePrecisionSubtitles: true, disableSceneFx: true },
      'J': { disableAllLottie: true, disableMorphTransitions: true, disableLottieIcons: true, disableCharacter: true, disablePrecisionSubtitles: true, disableSceneFx: true, disableAnimatedText: true },
      'K': { disableAllLottie: true, disableMorphTransitions: true, disableLottieIcons: true, disableCharacter: true, disablePrecisionSubtitles: true, disableSceneFx: true, disableAnimatedText: true, bareMinimum: true },
      'L': { smokeTestComposition: true },
      'M': { schemaOnlyTest: true },
      'N': { smokeTestComposition: true, strictMinimalPayload: true },
      'O': { schemaOnlyTest: true, strictMinimalPayload: true },
    };
    const profileFlags = profileDiagFlags[diagProfile] || {};

    // Create progress record
    const { data: progressRecord, error: progressError } = await supabase
      .from('universal_video_progress')
      .insert({
        user_id: userId,
        category: actualBriefing.category,
        status: 'pending',
        current_step: 'initializing',
        progress_percent: 0,
        briefing_json: actualBriefing,
      })
      .select()
      .single();

    if (progressError) {
      console.error('[auto-generate-universal-video] Progress insert error:', progressError);
      throw new Error('Failed to create progress record');
    }

    const progressId = progressRecord.id;
    console.log(`[auto-generate-universal-video] Progress ID: ${progressId}`);

    const responseBody = JSON.stringify({ progressId, status: 'started' });
    
    EdgeRuntime.waitUntil(
      runGenerationPipeline(supabase, progressId, actualBriefing, userId, diagProfile, profileFlags)
        .catch((err) => {
          console.error('[auto-generate-universal-video] Pipeline error in waitUntil:', err);
        })
    );

    return new Response(responseBody, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[auto-generate-universal-video] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function runGenerationPipeline(
  supabase: any,
  progressId: string,
  briefing: any,
  userId: string,
  diagProfile: string = 'A',
  profileFlags: Record<string, boolean> = {},
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    // PROFILE L/N: SmokeTest Composition
    if (profileFlags.smokeTestComposition) {
      const useStrict = !!profileFlags.strictMinimalPayload;
      const profileLabel = useStrict ? 'N' : 'L';
      console.log(`🧪 PROFILE ${profileLabel}: SmokeTest Composition — bypassing full pipeline, strictPayload=${useStrict}`);
      await updateProgress(supabase, progressId, 'rendering', 50, `🧪 SmokeTest-Composition (${useStrict ? 'strict-minimal' : 'normalized'} payload)...`);

      const REMOTION_SERVE_URL = Deno.env.get('REMOTION_SERVE_URL') || '';
      const pendingRenderId = generateRemotionCompatibleId();
      const webhookUrl = `${supabaseUrl}/functions/v1/remotion-webhook`;

      await supabase.from('video_renders').insert({
        render_id: pendingRenderId,
        bucket_name: DEFAULT_BUCKET_NAME,
        format_config: { format: 'mp4', aspect_ratio: '9:16', width: 1080, height: 1920 },
        content_config: { diagnosticProfile: profileLabel, smokeTest: true, strictPayload: useStrict, progressId },
        subtitle_config: {},
        status: 'pending',
        started_at: new Date().toISOString(),
        user_id: userId,
        source: 'universal-creator',
      });

      const webhookData = {
        url: webhookUrl,
        secret: null,
        customData: { pending_render_id: pendingRenderId, out_name: `smoketest-${pendingRenderId}.mp4`, user_id: userId, credits_used: 0, source: `smoke-test-${profileLabel}`, progressId },
      };

      let lambdaPayload: Record<string, unknown>;
      if (useStrict) {
        lambdaPayload = buildStrictMinimalPayload({
          serveUrl: REMOTION_SERVE_URL,
          composition: 'SmokeTest',
          inputProps: {},
          webhook: webhookData,
          outName: `smoketest-${pendingRenderId}.mp4`,
          bucketName: DEFAULT_BUCKET_NAME,
          durationInFrames: 60,
          fps: 30,
          width: 1080,
          height: 1920,
          logLevel: 'verbose',
        });
        (lambdaPayload as any)._payloadMode = 'strict-minimal';
      } else {
        lambdaPayload = normalizeStartPayload({
          type: 'start',
          serveUrl: REMOTION_SERVE_URL,
          composition: 'SmokeTest',
          inputProps: { type: 'payload' as const, payload: '{}' },
          codec: 'h264',
          imageFormat: 'jpeg',
          maxRetries: 1,
          logLevel: 'verbose',
          privacy: 'public',
          overwrite: true,
          outName: `smoketest-${pendingRenderId}.mp4`,
          bucketName: DEFAULT_BUCKET_NAME,
          durationInFrames: 60,
          fps: 30,
          width: 1080,
          height: 1920,
          webhook: webhookData,
        });
      }

      const diag = payloadDiagnostics(lambdaPayload);
      console.log(`🔧 SmokeTest payload diagnostics (${useStrict ? 'STRICT' : 'NORMALIZED'}):`, JSON.stringify(diag));

      await updateProgress(supabase, progressId, 'ready_to_render', 88, `🧪 SmokeTest bereit (${useStrict ? 'strict' : 'normalized'})...`, {
        renderId: pendingRenderId,
        outName: `smoketest-${pendingRenderId}.mp4`,
        lambdaPayload,
        progressId,
      });

      console.log(`[auto-generate-universal-video] PROFILE ${profileLabel} (SmokeTest) pipeline completed for ${progressId}`);
      return;
    }

    // PROFILE M/O: Schema-Only Test
    if (profileFlags.schemaOnlyTest) {
      const useStrict = !!profileFlags.strictMinimalPayload;
      const profileLabel = useStrict ? 'O' : 'M';
      console.log(`🧪 PROFILE ${profileLabel}: Schema-Only Test — minimal valid inputProps, strictPayload=${useStrict}`);
      await updateProgress(supabase, progressId, 'rendering', 50, `🧪 Schema-Test (${useStrict ? 'strict-minimal' : 'normalized'} payload)...`);

      const REMOTION_SERVE_URL = Deno.env.get('REMOTION_SERVE_URL') || '';
      const pendingRenderId = generateRemotionCompatibleId();
      const webhookUrl = `${supabaseUrl}/functions/v1/remotion-webhook`;

      await supabase.from('video_renders').insert({
        render_id: pendingRenderId,
        bucket_name: DEFAULT_BUCKET_NAME,
        format_config: { format: 'mp4', aspect_ratio: '9:16', width: 1080, height: 1920 },
        content_config: { diagnosticProfile: profileLabel, schemaOnlyTest: true, strictPayload: useStrict, progressId },
        subtitle_config: {},
        status: 'pending',
        started_at: new Date().toISOString(),
        user_id: userId,
        source: 'universal-creator',
      });

      const minimalInputProps = deepStripNulls({
        category: 'social-reel',
        storytellingStructure: 'hook-problem-solution',
        scenes: [{
          id: 'scene-test-1',
          order: 1,
          type: 'intro',
          title: `Schema Test ${profileLabel}`,
          duration: 2,
          startTime: 0,
          endTime: 2,
          background: { type: 'gradient', gradientColors: ['#3b82f6', '#1e40af'] },
          animation: 'fadeIn',
          kenBurnsDirection: 'in',
          textOverlay: { enabled: true, text: `SCHEMA TEST ${profileLabel}`, animation: 'fadeWords', position: 'center' },
          soundEffectType: 'none',
          beatAligned: false,
          transition: { type: 'fade', duration: 0.5, direction: 'right' },
        }],
        primaryColor: '#3b82f6',
        secondaryColor: '#1e40af',
        fontFamily: 'Inter',
        style: 'modern-3d',
        backgroundMusicVolume: 0,
        masterVolume: 1,
        useCharacter: false,
        characterType: 'svg',
        characterPosition: 'right',
        showProgressBar: false,
        showWatermark: false,
        fps: 30,
        targetWidth: 1080,
        targetHeight: 1920,
        diag: { diagnosticProfile: profileLabel, schemaOnlyTest: true, sanitizerVersion: `v12-profile${profileLabel}` },
      }) as Record<string, unknown>;

      const webhookData = {
        url: webhookUrl,
        secret: null,
        customData: { pending_render_id: pendingRenderId, out_name: `schema-test-${pendingRenderId}.mp4`, user_id: userId, credits_used: 0, source: `schema-test-${profileLabel}`, progressId },
      };

      let lambdaPayload: Record<string, unknown>;
      if (useStrict) {
        lambdaPayload = buildStrictMinimalPayload({
          serveUrl: REMOTION_SERVE_URL,
          composition: 'UniversalCreatorVideo',
          inputProps: minimalInputProps,
          webhook: webhookData,
          outName: `schema-test-${pendingRenderId}.mp4`,
          bucketName: DEFAULT_BUCKET_NAME,
          durationInFrames: 60,
          fps: 30,
          width: 1080,
          height: 1920,
          logLevel: 'verbose',
        });
        (lambdaPayload as any)._payloadMode = 'strict-minimal';
      } else {
        lambdaPayload = normalizeStartPayload({
          type: 'start',
          serveUrl: REMOTION_SERVE_URL,
          composition: 'UniversalCreatorVideo',
          inputProps: { type: 'payload' as const, payload: JSON.stringify(minimalInputProps) },
          codec: 'h264',
          imageFormat: 'jpeg',
          maxRetries: 1,
          logLevel: 'verbose',
          privacy: 'public',
          overwrite: true,
          outName: `schema-test-${pendingRenderId}.mp4`,
          bucketName: DEFAULT_BUCKET_NAME,
          durationInFrames: 60,
          fps: 30,
          width: 1080,
          height: 1920,
          webhook: webhookData,
        });
      }

      const diag = payloadDiagnostics(lambdaPayload);
      console.log(`🔧 Schema-Test payload diagnostics (${useStrict ? 'STRICT' : 'NORMALIZED'}):`, JSON.stringify(diag));

      await updateProgress(supabase, progressId, 'ready_to_render', 88, `🧪 Schema-Test bereit (${useStrict ? 'strict' : 'normalized'})...`, {
        renderId: pendingRenderId,
        outName: `schema-test-${pendingRenderId}.mp4`,
        lambdaPayload,
        progressId,
      });

      console.log(`[auto-generate-universal-video] PROFILE ${profileLabel} (Schema-Only) pipeline completed for ${progressId}`);
      return;
    }

    // Step 1: Generate Script (10%)
    await updateProgress(supabase, progressId, 'generating_script', 5, '📝 Drehbuch wird erstellt...');
    await delay(500);

    const scriptResponse = await fetch(`${supabaseUrl}/functions/v1/generate-universal-script`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ briefing }),
    });

    if (!scriptResponse.ok) {
      const errorText = await scriptResponse.text();
      console.error('[auto-generate-universal-video] Script generation failed:', scriptResponse.status, errorText);
      throw new Error(`Script generation failed: ${errorText}`);
    }

    const { script } = await scriptResponse.json();
    console.log(`[auto-generate-universal-video] Script generated: ${script.scenes.length} scenes`);

    await updateProgress(supabase, progressId, 'script_complete', 15, '✅ Drehbuch fertig!', { script });
    await delay(500);

    // Step 2: Generate Character Sheet if needed (25%)
    let characterSheetUrl = null;
    if (briefing.hasCharacter) {
      await updateProgress(supabase, progressId, 'generating_character', 20, '🎭 Charakter wird erstellt...');
      await delay(500);

      const characterResponse = await fetch(`${supabaseUrl}/functions/v1/generate-premium-visual`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: `Character sheet for ${briefing.characterName || 'protagonist'}: ${briefing.characterDescription || 'friendly professional character'}. ${briefing.visualStyle} style. Multiple poses showing front view, side view, and expressions. Clean white background.`,
          style: briefing.visualStyle,
          aspectRatio: '1:1',
        }),
      });

      if (characterResponse.ok) {
        const { imageUrl } = await characterResponse.json();
        characterSheetUrl = imageUrl;
        console.log(`[auto-generate-universal-video] Character sheet generated`);
      }

      await updateProgress(supabase, progressId, 'character_complete', 25, '✅ Charakter fertig!', { characterSheetUrl });
      await delay(500);
    }

    // Step 3: Generate Scene Visuals (25% - 60%) - PARALLEL for speed
    const totalScenes = script.scenes.length;
    await updateProgress(supabase, progressId, 'generating_visuals', 30, `🎨 ${totalScenes} Szenen-Bilder werden parallel erstellt...`);

    const visualPromises = script.scenes.map(async (scene: any, i: number) => {
      try {
        const visualResponse = await fetch(`${supabaseUrl}/functions/v1/generate-premium-visual`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: `${scene.visualDescription}. Style: ${briefing.visualStyle}. Professional quality, ${briefing.emotionalTone} mood. Brand colors: ${briefing.brandColors?.join(', ') || 'professional palette'}.`,
            style: briefing.visualStyle,
            aspectRatio: briefing.aspectRatio,
            characterSheetUrl: characterSheetUrl,
          }),
        });

        if (visualResponse.ok) {
          const { imageUrl } = await visualResponse.json();
          console.log(`[auto-generate-universal-video] Scene ${i + 1} visual generated`);
          return imageUrl;
        } else {
          const errorText = await visualResponse.text();
          console.error(`[auto-generate-universal-video] Scene ${i + 1} visual failed:`, visualResponse.status, errorText);
          return await generateSVGPlaceholder(scene.title, briefing.brandColors?.[0]);
        }
      } catch (e) {
        console.error(`[auto-generate-universal-video] Scene ${i + 1} visual error:`, e);
        return await generateSVGPlaceholder(scene.title, briefing.brandColors?.[0]);
      }
    });

    const sceneVisuals = await Promise.all(visualPromises);
    
    sceneVisuals.forEach((url: string, i: number) => {
      script.scenes[i].imageUrl = url;
    });

    await updateProgress(supabase, progressId, 'visuals_complete', 60, '✅ Alle Szenen-Bilder fertig!', { sceneVisuals });

    // Step 4: Generate Voice-Over WITH TIMESTAMPS for Lip-Sync (60% - 70%)
    await updateProgress(supabase, progressId, 'generating_voiceover', 65, '🎙️ Voiceover wird erstellt...');
    await delay(500);

    const fullScript = script.scenes.map((s: any) => s.voiceover).join(' ');
    
    const voiceoverResponse = await fetch(`${supabaseUrl}/functions/v1/generate-video-voiceover`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scriptText: fullScript,
        voiceGender: briefing.voiceGender || 'male',
        language: briefing.voiceLanguage || 'de',
        withTimestamps: true,
      }),
    });

    let voiceoverUrl = null;
    let phonemeTimestamps = null;
    if (voiceoverResponse.ok) {
      const voiceoverData = await voiceoverResponse.json();
      voiceoverUrl = voiceoverData.audioUrl;
      
      if (voiceoverData.alignment) {
        const alignment = voiceoverData.alignment;
        phonemeTimestamps = transformAlignmentToPhonemes(alignment);
        console.log(`[auto-generate-universal-video] Voiceover generated with phoneme timestamps:`, {
          originalCharacters: alignment.characters?.length || 0,
          transformedPhonemes: phonemeTimestamps?.length || 0,
        });
      }
    } else {
      const errorText = await voiceoverResponse.text();
      console.error('[auto-generate-universal-video] Voiceover failed:', voiceoverResponse.status, errorText);
    }

    await updateProgress(supabase, progressId, 'voiceover_complete', 70, '✅ Voiceover fertig!', { voiceoverUrl });
    await delay(500);

    // Step 4b: Generate Subtitles from Voiceover (70% - 75%)
    let subtitles = null;
    if (voiceoverUrl) {
      await updateProgress(supabase, progressId, 'generating_subtitles', 72, '📝 Untertitel werden erstellt...');
      await delay(500);

      try {
        const subtitleResponse = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audioUrl: voiceoverUrl,
            language: briefing.voiceLanguage || 'de',
          }),
        });

        if (subtitleResponse.ok) {
          const subtitleData = await subtitleResponse.json();
          subtitles = subtitleData.subtitles;
          console.log(`[auto-generate-universal-video] Subtitles generated: ${subtitles?.length || 0} segments`);
        } else {
          console.error('[auto-generate-universal-video] Subtitle generation failed:', await subtitleResponse.text());
        }
      } catch (e) {
        console.error('[auto-generate-universal-video] Subtitle error:', e);
      }

      await updateProgress(supabase, progressId, 'subtitles_complete', 75, '✅ Untertitel fertig!');
      await delay(500);
    }

    // Step 5: Select Background Music (75% - 78%)
    await updateProgress(supabase, progressId, 'selecting_music', 76, '🎵 Musik wird ausgewählt...');
    await delay(500);

    const musicUrl = await selectBackgroundMusic(supabase, briefing.musicStyle, briefing.musicMood, supabaseUrl, supabaseServiceKey);

    await updateProgress(supabase, progressId, 'music_complete', 78, '✅ Musik ausgewählt!', { musicUrl });
    await delay(500);

    // Step 5b: Analyze Music Beats (78% - 82%)
    let beatSyncData = null;
    if (musicUrl) {
      await updateProgress(supabase, progressId, 'analyzing_beats', 79, '🎼 Beat-Analyse läuft...');
      await delay(500);

      try {
        const totalDuration = script.scenes.reduce((acc: number, scene: any) => 
          acc + (scene.durationSeconds || scene.duration || 5), 0);

        const beatResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-music-beats`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            musicUrl,
            duration: totalDuration,
          }),
        });

        if (beatResponse.ok) {
          beatSyncData = await beatResponse.json();
          console.log(`[auto-generate-universal-video] Beat analysis complete: ${beatSyncData.bpm} BPM, ${beatSyncData.transitionPoints?.length || 0} transition points`);
        } else {
          console.error('[auto-generate-universal-video] Beat analysis failed:', await beatResponse.text());
        }
      } catch (e) {
        console.error('[auto-generate-universal-video] Beat analysis error:', e);
      }

      await updateProgress(supabase, progressId, 'beats_complete', 82, '✅ Beat-Analyse fertig!');
      await delay(500);
    }

    // Step 6: Render Video (82% - 100%)
    await updateProgress(supabase, progressId, 'rendering', 85, '🎬 Video wird gerendert...');
    await delay(500);

    console.log('[auto-generate-universal-video] Starting DIRECT Lambda invocation (no intermediate hop)...');

    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region: AWS_REGION,
    });

    const REMOTION_SERVE_URL = Deno.env.get('REMOTION_SERVE_URL');
    if (!REMOTION_SERVE_URL) {
      throw new Error('REMOTION_SERVE_URL not configured');
    }

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
    let fps = 30;
    const totalDuration = script.scenes.reduce((acc: number, scene: any) => {
      return acc + (scene.durationSeconds || scene.duration || 5);
    }, 0);
    let durationInFrames = Math.max(30, Math.min(36000, Math.ceil(totalDuration * fps)));
    
    // r27: Check scheduling BEFORE building payload — reduce fps if needed
    const mainScheduling = calculateScheduling(durationInFrames);
    if (mainScheduling.needsFpsReduction && fps > 24) {
      const originalFps = fps;
      fps = 24;
      durationInFrames = Math.max(30, Math.min(36000, Math.ceil(totalDuration * fps)));
      console.log(`[auto-generate-universal-video] 📉 r27 MAIN PATH FPS REDUCTION: ${originalFps}fps → ${fps}fps, frames ${Math.ceil(totalDuration * originalFps)} → ${durationInFrames}`);
    }
    console.log(`[auto-generate-universal-video] r27 scheduling: fps=${fps}, frames=${durationInFrames}, fpl=${mainScheduling.needsFpsReduction ? calculateScheduling(durationInFrames).framesPerLambda : mainScheduling.framesPerLambda}`);

    const remotionScenes = script.scenes.map((scene: any, index: number) => {
      const startTime = script.scenes.slice(0, index).reduce((acc: number, s: any) =>
        acc + (s.durationSeconds || s.duration || 5), 0);
      const duration = scene.durationSeconds || scene.duration || 5;
      const sceneType = validateEnum(scene.sceneType || scene.type || 'content', VALID_SCENE_TYPES, 'feature');

      return {
        id: `scene-${index}`,
        order: index + 1,
        type: sceneType,
        title: scene.title || '',
        duration: duration,
        startTime,
        endTime: startTime + duration,
        background: {
          type: validateEnum(scene.imageUrl ? 'image' : 'gradient', ['color', 'gradient', 'video', 'image'], 'gradient'),
          imageUrl: scene.imageUrl || undefined,
          gradientColors: briefing.brandColors || ['#3b82f6', '#1e40af'],
        },
        animation: validateEnum(scene.animation || getDefaultAnimation(sceneType), VALID_ANIMATIONS, 'fadeIn'),
        kenBurnsDirection: validateEnum(scene.kenBurnsDirection || 'in', VALID_KEN_BURNS, 'in'),
        textOverlay: {
          enabled: true,
          text: scene.title || '',
          animation: validateEnum(scene.textAnimation || getDefaultTextAnimation(sceneType), VALID_TEXT_ANIMATIONS, 'fadeWords'),
          position: validateEnum(scene.textPosition || 'center', VALID_TEXT_POSITIONS, 'center'),
        },
        soundEffectType: validateEnum(scene.soundEffect || getDefaultSoundEffect(sceneType), VALID_SOUND_EFFECTS, 'none'),
        beatAligned: scene.beatAligned ?? (sceneType === 'cta'),
        transition: {
          type: validateEnum(scene.transitionIn || 'fade', VALID_TRANSITION_TYPES, 'fade'),
          duration: 0.5,
          direction: 'right',
        },
      };
    });

    const sanitizedBeatSync = sanitizeBeatSyncData(beatSyncData);
    
    const disableMorphTransitions = profileFlags.disableMorphTransitions === true;
    const disableLottieIcons = profileFlags.disableLottieIcons === true;
    const forceEmbeddedCharacterLottie = true;
    const disablePrecisionSubtitles = profileFlags.disablePrecisionSubtitles === true;
    const disableSceneFx = profileFlags.disableSceneFx === true;
    const disableAnimatedText = profileFlags.disableAnimatedText === true;
    const isBareMinimum = profileFlags.bareMinimum === true;
    const disableCharacter = profileFlags.disableCharacter === true;
    const disableAllLottie = profileFlags.disableAllLottie === true;

    const finalScenes = isBareMinimum ? [{
      id: 'scene-smoke-k',
      order: 1,
      type: 'intro' as const,
      title: 'Smoke Test K',
      duration: 2,
      startTime: 0,
      endTime: 2,
      background: {
        type: 'gradient' as const,
        gradientColors: ['#3b82f6', '#1e40af'],
      },
      animation: 'fadeIn' as const,
      kenBurnsDirection: 'in' as const,
      textOverlay: {
        enabled: true,
        text: 'SMOKE TEST K',
        animation: 'fadeWords' as const,
        position: 'center' as const,
      },
      soundEffectType: 'none' as const,
      beatAligned: false,
      transition: {
        type: 'fade' as const,
        duration: 0.5,
        direction: 'right',
      },
    }] : remotionScenes;

    const inputProps = deepStripNulls({
      category: validateEnum(briefing.category, VALID_CATEGORIES, 'social-reel'),
      storytellingStructure: validateEnum(briefing.storytellingStructure, VALID_STORYTELLING, 'hook-problem-solution'),
      scenes: finalScenes,
      primaryColor: briefing.brandColors?.[0] || '#3b82f6',
      secondaryColor: briefing.brandColors?.[1] || '#1e40af',
      fontFamily: briefing.fontFamily || 'Inter',
      style: validateEnum(briefing.visualStyle, VALID_STYLES, 'modern-3d'),
      voiceoverUrl: isBareMinimum ? undefined : (voiceoverUrl || undefined),
      backgroundMusicUrl: isBareMinimum ? undefined : (musicUrl || undefined),
      backgroundMusicVolume: isBareMinimum ? 0 : 0.3,
      masterVolume: 1,
      useCharacter: isBareMinimum ? false : ((disableCharacter || disableAllLottie) ? false : (briefing.hasCharacter !== false)),
      characterType: isBareMinimum ? 'svg' : ((disableCharacter || disableAllLottie) ? 'svg' : validateEnum(briefing.characterType, ['svg', 'lottie', 'rive'], 'lottie')),
      characterPosition: 'right',
      phonemeTimestamps: isBareMinimum ? undefined : ((phonemeTimestamps && Array.isArray(phonemeTimestamps) && phonemeTimestamps.length > 0) ? phonemeTimestamps : undefined),
      subtitles: (isBareMinimum || disablePrecisionSubtitles) ? undefined : [],
      subtitleStyle: (isBareMinimum || disablePrecisionSubtitles) ? undefined : {
        position: validateEnum(briefing.subtitlePosition, VALID_TEXT_POSITIONS, 'bottom'),
        animation: validateEnum('highlight', VALID_SUBTITLE_ANIMATIONS, 'highlight'),
        outlineStyle: validateEnum('glow', VALID_OUTLINE_STYLES, 'glow'),
        fontSize: 32,
        fontColor: '#FFFFFF',
        backgroundColor: '#000000',
        backgroundOpacity: 0.7,
        outlineColor: '#000000',
        outlineWidth: 2,
      },
      showProgressBar: isBareMinimum ? false : (briefing.showProgressBar !== false),
      showWatermark: isBareMinimum ? false : (briefing.showWatermark === true),
      watermarkText: isBareMinimum ? undefined : (briefing.watermarkText || undefined),
      beatSyncData: isBareMinimum ? undefined : sanitizedBeatSync,
      targetWidth: dimensions.width,
      targetHeight: dimensions.height,
      fps,
      diag: {
        disableMorphTransitions,
        disableLottieIcons,
        forceEmbeddedCharacterLottie,
        disablePrecisionSubtitles,
        disableCharacter,
        disableAllLottie,
        disableSceneFx,
        disableAnimatedText,
        sanitizerVersion: 'v10-profileK-bareMinimum-preflightZod',
        diagnosticProfile: diagProfile,
      },
    }) as Record<string, unknown>;

    const inputPropsDiagnostics = {
      canary: 'payload-sanitizer-v10-profileK-bareMinimum-preflightZod',
      category: (inputProps as any).category,
      storytellingStructure: (inputProps as any).storytellingStructure,
      style: (inputProps as any).style,
      characterType: (inputProps as any).characterType,
      useCharacter: (inputProps as any).useCharacter,
      sceneCount: remotionScenes.length,
      sceneTypes: remotionScenes.map((s: any) => s.type),
      sceneAnimations: remotionScenes.map((s: any) => s.animation),
      hasBeatSync: !!sanitizedBeatSync,
      hasVoiceover: !!voiceoverUrl,
      hasMusic: !!musicUrl,
      hasPhonemes: !!(phonemeTimestamps && phonemeTimestamps.length > 0),
      hasSubtitleStyle: !!(inputProps as any).subtitleStyle,
      diagToggles: (inputProps as any).diag,
      nullFieldCount: JSON.stringify(inputProps).split(':null').length - 1,
      fieldCount: Object.keys(inputProps as any).length,
      payloadSizeEstimate: JSON.stringify(inputProps).length,
    };
    console.log('🔍 InputProps diagnostics:', JSON.stringify(inputPropsDiagnostics));

    // PRE-FLIGHT ZOD VALIDATION
    try {
      const inputPropsJson = JSON.stringify(inputProps);
      const reparsed = JSON.parse(inputPropsJson);
      
      const preflightErrors: string[] = [];
      if (!reparsed.scenes || !Array.isArray(reparsed.scenes) || reparsed.scenes.length === 0) {
        preflightErrors.push('scenes: must be a non-empty array');
      }
      if (reparsed.scenes) {
        reparsed.scenes.forEach((scene: any, idx: number) => {
          if (!scene.id) preflightErrors.push(`scenes[${idx}].id: missing`);
          if (!scene.type) preflightErrors.push(`scenes[${idx}].type: missing`);
          if (typeof scene.duration !== 'number') preflightErrors.push(`scenes[${idx}].duration: not a number`);
          if (!scene.background) preflightErrors.push(`scenes[${idx}].background: missing`);
          if (scene.background && !scene.background.type) preflightErrors.push(`scenes[${idx}].background.type: missing`);
          if (!scene.textOverlay) preflightErrors.push(`scenes[${idx}].textOverlay: missing`);
          if (!scene.transition) preflightErrors.push(`scenes[${idx}].transition: missing`);
        });
      }
      if (!reparsed.category) preflightErrors.push('category: missing');
      if (!reparsed.storytellingStructure) preflightErrors.push('storytellingStructure: missing');
      
      if (preflightErrors.length > 0) {
        const errorMsg = `PRE-FLIGHT VALIDATION FAILED (${preflightErrors.length} errors): ${preflightErrors.join('; ')}`;
        console.error(`❌ ${errorMsg}`);
        await updateProgress(supabase, progressId, 'failed', 0, `Schema-Fehler: ${errorMsg}`);
        return;
      }
      
      console.log(`✅ Pre-flight validation passed: ${reparsed.scenes?.length || 0} scenes, profile=${diagProfile}, bareMinimum=${isBareMinimum}`);
    } catch (preflightErr) {
      const msg = preflightErr instanceof Error ? preflightErr.message : String(preflightErr);
      console.error(`❌ Pre-flight JSON parse error: ${msg}`);
      await updateProgress(supabase, progressId, 'failed', 0, `Pre-flight Fehler: ${msg}`);
      return;
    }

    // Credit check & deduction
    const calculateCredits = (durationSeconds: number): number => {
      if (durationSeconds < 30) return 10;
      if (durationSeconds <= 60) return 20;
      if (durationSeconds <= 180) return 50;
      if (durationSeconds <= 300) return 100;
      return 200;
    };
    const credits_required = calculateCredits(totalDuration);
    console.log(`💰 Credits required: ${credits_required} for ${totalDuration}s video`);

    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (!wallet || wallet.balance < credits_required) {
      throw new Error(`Nicht genügend Credits. Benötigt: ${credits_required}, Verfügbar: ${wallet?.balance || 0}`);
    }

    await supabase.rpc('deduct_credits', { p_user_id: userId, p_amount: credits_required });
    console.log(`💰 Deducted ${credits_required} credits`);

    const pendingRenderId = generateRemotionCompatibleId();
    const webhookUrl = `${supabaseUrl}/functions/v1/remotion-webhook`;

    await supabase.from('video_renders').insert({
      render_id: pendingRenderId,
      bucket_name: DEFAULT_BUCKET_NAME,
      format_config: { format: 'mp4', aspect_ratio: briefing.aspectRatio || '16:9', width: dimensions.width, height: dimensions.height },
      content_config: { category: briefing.category, scenes: remotionScenes.length, hasVoiceover: !!voiceoverUrl, hasMusic: !!musicUrl, credits_used: credits_required, diagnosticProfile: diagProfile, diag_flags: (inputProps as any).diag, progressId: progressId },
      subtitle_config: {},
      status: 'pending',
      started_at: new Date().toISOString(),
      user_id: userId,
      source: 'universal-creator',
    });

    // r31: Build Lambda payload with 600s timeout scheduling (8 Lambdas, 225 fpl for 30fps)
    console.log('🔄 Building and normalizing Lambda payload for Remotion 4.0.424 (r31 lambda600s)');
    const serializedInputProps = {
      type: 'payload' as const,
      payload: JSON.stringify(inputProps),
    };

    const lambdaPayload = normalizeStartPayload({
      type: 'start',
      serveUrl: REMOTION_SERVE_URL,
      composition: 'UniversalCreatorVideo',
      inputProps: serializedInputProps,
      codec: 'h264',
      imageFormat: 'jpeg',
      maxRetries: 1,
      logLevel: diagProfile !== 'A' ? 'verbose' : 'warn',
      privacy: 'public',
      overwrite: true,
      outName: `universal-video-${pendingRenderId}.mp4`,
      bucketName: DEFAULT_BUCKET_NAME,
      durationInFrames: isBareMinimum ? 60 : durationInFrames,
      fps: fps,
      width: dimensions.width,
      height: dimensions.height,
      webhook: {
        url: webhookUrl,
        secret: null,
        customData: { pending_render_id: pendingRenderId, out_name: `universal-video-${pendingRenderId}.mp4`, user_id: userId, credits_used: credits_required, source: 'universal-creator', progressId: progressId },
      },
    });

    const diag = payloadDiagnostics(lambdaPayload);
    console.log('🔧 Normalized payload diagnostics:', JSON.stringify(diag));

    // ZWEI-PHASEN-ANSATZ: Payload in DB speichern statt Lambda direkt aufrufen
    const payloadSizeBytes = new TextEncoder().encode(JSON.stringify(lambdaPayload)).length;
    console.log(`📦 Payload size: ${(payloadSizeBytes / 1024).toFixed(1)} KB`);

    await updateProgress(supabase, progressId, 'ready_to_render', 88, '🚀 Rendering wird vorbereitet...', {
      renderId: pendingRenderId,
      outName: `universal-video-${pendingRenderId}.mp4`,
      lambdaPayload: lambdaPayload,
      progressId: progressId,
    });

    console.log(`[auto-generate-universal-video] Pipeline completed for ${progressId}.`);

  } catch (error) {
    console.error(`[auto-generate-universal-video] Pipeline error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // r25: Tag error with category for frontend decision-making
    const errorCategory = isInfraError(errorMessage) ? 'rate_limit' : 'unknown';
    await updateProgress(supabase, progressId, 'failed', 0, `Fehler: ${errorMessage}`, {
      errorCategory,
      errorMessage,
    });
  }
}

/**
 * r25: RENDER-ONLY PIPELINE — reuses existing assets (images, voiceover, music)
 * Now accepts retryAttempt for adaptive scheduling (fewer Lambdas on retry)
 */
async function runRenderOnlyPipeline(
  supabase: any,
  newProgressId: string,
  existingResultData: any,
  userId: string,
  existingProgress: any,
  retryAttempt: number = 1,
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  // r37: Derive chain source ID — follows the chain back to the original asset-generating progress
  const chainSourceProgressId = existingResultData?.sourceProgressId || existingProgress.id;
  console.log(`[render-only] 🔗 r37 chainSourceProgressId: ${chainSourceProgressId}`);

  try {
    console.log(`[render-only] 🔄 Starting render-only pipeline for ${newProgressId} (attempt ${retryAttempt})`);
    
    const oldPayload = existingResultData.lambdaPayload;
    const newRenderId = generateRemotionCompatibleId();
    const newOutName = `universal-video-${newRenderId}.mp4`;
    const webhookUrl = `${supabaseUrl}/functions/v1/remotion-webhook`;
    
    // Credit check & deduction for render-only (cheaper)
    const RENDER_ONLY_CREDITS = 5;
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .single();
    
    if (!wallet || wallet.balance < RENDER_ONLY_CREDITS) {
      throw new Error(`Nicht genügend Credits für Render-Retry. Benötigt: ${RENDER_ONLY_CREDITS}, Verfügbar: ${wallet?.balance || 0}`);
    }
    
    await supabase.rpc('deduct_credits', { p_user_id: userId, p_amount: RENDER_ONLY_CREDITS });
    console.log(`[render-only] 💰 Deducted ${RENDER_ONLY_CREDITS} credits (render-only)`);
    
    // Create new render record
    const bucketName = oldPayload.bucketName || 'remotionlambda-eucentral1-13gm4o6s90';
    await supabase.from('video_renders').insert({
      render_id: newRenderId,
      bucket_name: bucketName,
      format_config: oldPayload.width && oldPayload.height 
        ? { format: 'mp4', width: oldPayload.width, height: oldPayload.height }
        : { format: 'mp4', width: 1080, height: 1920 },
      content_config: { 
        renderOnly: true, 
        retryAttempt,
        sourceProgressId: chainSourceProgressId,
        credits_used: RENDER_ONLY_CREDITS,
        progressId: newProgressId,
      },
      subtitle_config: {},
      status: 'pending',
      started_at: new Date().toISOString(),
      user_id: userId,
      source: 'universal-creator',
    });
    
    // r28: Clone the payload and RECALCULATE based on error type
    const newPayload = { ...oldPayload };
    newPayload.outName = newOutName;
    
    let dif = oldPayload.durationInFrames || 900;
    let fps = oldPayload.fps || 30;
    const originalFps = fps;
    
    // r28: Read error category from source progress to determine strategy
    const sourceErrorCategory = existingResultData.errorCategory || 'unknown';
    const sourceErrorMessage = existingResultData.errorMessage || '';
    console.log(`[render-only] 🏷️ Source error category: ${sourceErrorCategory}, msg: ${sourceErrorMessage.substring(0, 120)}`);
    
    // r32: Detect Lottie-specific stall
    const isLottieStall = /waiting for lottie|delayrender.*lottie|lottie.*animation.*load/i.test(sourceErrorMessage);
    // r33: Detect audio corruption (ffprobe crash)
    const isAudioCorruption = sourceErrorCategory === 'audio_corruption' || /ffprobe.*failed|ffprobe.*exit code|invalid data found.*processing input|failed to find.*mpeg audio/i.test(sourceErrorMessage);
    
    // r32: Lottie fallback flags — applied to inputProps.diag
    let lottieFallbackFlags: Record<string, boolean> = {};
    // r33: Audio strip flag
    let audioStripped = false;
    
    if (isAudioCorruption) {
      // r33: AUDIO CORRUPTION → keep 30fps, strip all audio sources
      console.log(`[render-only] 🔊 r33 AUDIO CORRUPTION detected — keeping ${fps}fps, stripping audio sources`);
      audioStripped = true;
    } else if (sourceErrorCategory === 'lambda_crash' && isLottieStall) {
      // r35: LOTTIE STALL → keep 30fps, IMMEDIATELY disable ALL Lottie (no gradual degradation)
      // The <Lottie> component's internal delayRender hangs even with embedded data in Lambda
      console.log(`[render-only] 🎭 r35 LOTTIE STALL detected — keeping ${fps}fps, disableAllLottie IMMEDIATELY (attempt ${retryAttempt})`);
      lottieFallbackFlags = {
        disableAllLottie: true,
        disableLottieIcons: true,
        disableMorphTransitions: true,
        disableCharacter: true,
      };
      console.log(`[render-only] 🎭 r35 Lottie fallback: disableAllLottie + disableCharacter (no <Lottie> mount in Lambda)`);
    } else if (sourceErrorCategory === 'timeout') {
      // TIMEOUT: Reduce fps aggressively, keep max Lambdas
      // Progressive fps fallback chain: 24fps → 20fps → 15fps
      const FPS_CHAIN = [24, 20, 15];
      const targetFps = FPS_CHAIN[Math.min(retryAttempt - 1, FPS_CHAIN.length - 1)] || 15;
      
      if (fps > targetFps) {
        const durationSeconds = dif / fps;
        fps = targetFps;
        dif = Math.round(durationSeconds * fps);
        console.log(`[render-only] 📉 r28 TIMEOUT FPS REDUCTION: ${originalFps}fps → ${fps}fps, frames ${oldPayload.durationInFrames} → ${dif} (attempt ${retryAttempt})`);
      }
    } else if (sourceErrorCategory === 'rate_limit') {
      // RATE LIMIT: Keep fps, reduce Lambda count (increases fpl)
      // This is handled by calculateScheduling's retryAttempt parameter
      console.log(`[render-only] 🔧 r28 RATE_LIMIT strategy: keeping fps=${fps}, reducing Lambdas via retryAttempt=${retryAttempt}`);
    } else if (sourceErrorCategory === 'lambda_crash') {
      // Non-Lottie lambda crash: also try Lottie fallback as defensive measure
      console.log(`[render-only] 🔧 r32 NON-LOTTIE lambda_crash: applying defensive Lottie disable + fps reduction`);
      lottieFallbackFlags = {
        disableLottieIcons: true,
        disableMorphTransitions: true,
        forceEmbeddedCharacterLottie: true,
      };
      const FPS_CHAIN = [24, 20, 15];
      const targetFps = FPS_CHAIN[Math.min(retryAttempt - 1, FPS_CHAIN.length - 1)] || 15;
      if (fps > targetFps) {
        const durationSeconds = dif / fps;
        fps = targetFps;
        dif = Math.round(durationSeconds * fps);
        console.log(`[render-only] 📉 r32 lambda_crash FPS REDUCTION: ${originalFps}fps → ${fps}fps (attempt ${retryAttempt})`);
      }
    } else {
      // Unknown: Use same progressive fps reduction as timeout
      const FPS_CHAIN = [24, 20, 15];
      const targetFps = FPS_CHAIN[Math.min(retryAttempt - 1, FPS_CHAIN.length - 1)] || 15;
      if (fps > targetFps) {
        const durationSeconds = dif / fps;
        fps = targetFps;
        dif = Math.round(durationSeconds * fps);
        console.log(`[render-only] 📉 r28 FALLBACK FPS REDUCTION: ${originalFps}fps → ${fps}fps, frames ${oldPayload.durationInFrames} → ${dif} (attempt ${retryAttempt}, category=${sourceErrorCategory})`);
      }
    }
    
    // Calculate scheduling with potentially reduced frame count
    const scheduling = calculateScheduling(dif, { retryAttempt: sourceErrorCategory === 'rate_limit' ? retryAttempt : undefined });
    
    // Update payload with new fps and duration
    newPayload.durationInFrames = dif;
    newPayload.fps = fps;
    newPayload.frameRange = [0, dif - 1];
    
    // Also update inputProps if they contain fps/durationInFrames + r32: inject Lottie fallback flags + r33: strip audio
    if (newPayload.inputProps?.type === 'payload') {
      try {
        const props = JSON.parse(newPayload.inputProps.payload);
        if (props.fps) props.fps = fps;
        if (props.durationInFrames) props.durationInFrames = dif;
        
        // r32: Merge Lottie fallback flags into diag
        if (Object.keys(lottieFallbackFlags).length > 0) {
          props.diag = { ...(props.diag || {}), ...lottieFallbackFlags, r32_lottieRecovery: true, r32_retryAttempt: retryAttempt };
          // Also update character settings if disableAllLottie is set
          if (lottieFallbackFlags.disableAllLottie || lottieFallbackFlags.disableCharacter) {
            props.useCharacter = false;
            props.characterType = 'svg';
          }
          console.log(`[render-only] 🎭 r32 injected Lottie fallback flags into inputProps.diag:`, JSON.stringify(lottieFallbackFlags));
        }
        
        // r33: Strip corrupt audio sources from inputProps
        if (audioStripped) {
          props.voiceoverUrl = undefined;
          props.backgroundMusicUrl = undefined;
          props.backgroundMusicVolume = 0;
          if (props.content) {
            props.content.voiceoverUrl = undefined;
            props.content.backgroundMusicUrl = undefined;
            props.content.backgroundMusicVolume = 0;
            props.content.useVoiceover = false;
          }
          if (props.subtitles) {
            props.subtitles.segments = [];
          }
          props.diag = { ...(props.diag || {}), r33_audioStripped: true, r33_retryAttempt: retryAttempt };
          console.log(`[render-only] 🔊 r33 stripped audio sources from inputProps (voiceover + background music removed)`);
        }
        
        newPayload.inputProps = { type: 'payload', payload: JSON.stringify(props) };
      } catch (e) {
        console.warn('[render-only] Could not update inputProps fps (non-fatal)');
      }
    }
    
    const newFPL = scheduling.framesPerLambda;
    const estimatedLambdas = scheduling.estimatedLambdas;
    const estTime = (newFPL * 2.0).toFixed(1);
    console.log(`[render-only] 📊 r31 scheduling: fpl=${newFPL} (was ${oldPayload.framesPerLambda}), lambdas=${estimatedLambdas}, fps=${fps}, attempt=${retryAttempt}, estTime=${estTime}s, timeout=600s`);
    newPayload.framesPerLambda = newFPL;
    
    if (newPayload.webhook) {
      newPayload.webhook = {
        ...newPayload.webhook,
        url: webhookUrl,
        customData: {
          ...(newPayload.webhook.customData || {}),
          pending_render_id: newRenderId,
          out_name: newOutName,
          user_id: userId,
          credits_used: RENDER_ONLY_CREDITS,
          source: 'universal-creator-render-only',
          progressId: newProgressId,
          retryAttempt,
        },
      };
    }
    
    console.log(`[render-only] ✅ New render record created: ${newRenderId}, payload cloned with adaptive scheduling`);
    
    const statusLabel = audioStripped ? '🔊 Audio entfernt' : Object.keys(lottieFallbackFlags).length > 0 ? 'Lottie-Safe' : '';
    await updateProgress(supabase, newProgressId, 'ready_to_render', 88, `🚀 Render-Only Retry #${retryAttempt} bereit (${estimatedLambdas} Lambdas${statusLabel ? ', ' + statusLabel : ''})...`, {
      renderId: newRenderId,
      outName: newOutName,
      lambdaPayload: newPayload,
      progressId: newProgressId,
      renderOnly: true,
      retryAttempt,
      // r37: Persist chain source ID for deterministic retry counting
      sourceProgressId: chainSourceProgressId,
      // r32: Persist Lottie fallback state for debugging/UI
      ...(Object.keys(lottieFallbackFlags).length > 0 ? { lottieFallbackFlags, isLottieStall } : {}),
      // r33: Persist audio strip state
      ...(audioStripped ? { r33_audioStripped: true, isAudioCorruption: true } : {}),
    });
    
    console.log(`[render-only] ✅ Pipeline completed for ${newProgressId}`);
    
  } catch (error) {
    console.error(`[render-only] ❌ Pipeline error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCategory = isInfraError(errorMessage) ? (errorMessage.toLowerCase().includes('timeout') ? 'timeout' : 'rate_limit') : 'unknown';
    await updateProgress(supabase, newProgressId, 'failed', 0, `Render-Only Fehler: ${errorMessage}`, {
      errorCategory,
      errorMessage,
      sourceProgressId: chainSourceProgressId,
    });
  }
}

async function updateProgress(
  supabase: any,
  progressId: string,
  step: string,
  percent: number,
  message: string,
  data?: Record<string, any>
) {
  const updateData: any = {
    current_step: step,
    progress_percent: percent,
    status_message: message,
    updated_at: new Date().toISOString(),
  };

  if (step === 'completed') {
    updateData.status = 'completed';
    updateData.completed_at = new Date().toISOString();
  } else if (step === 'failed') {
    updateData.status = 'failed';
  } else {
    updateData.status = 'processing';
  }

  if (data) {
    updateData.result_data = data;
  }

  const { error } = await supabase
    .from('universal_video_progress')
    .update(updateData)
    .eq('id', progressId);

  if (error) {
    console.error('[auto-generate-universal-video] Progress update error:', error);
  }
}

async function selectBackgroundMusic(
  supabase: any,
  style: string,
  mood: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<string | null> {
  // r39C: Fetch multiple candidates and validate via HEAD request
  try {
    const searchResponse = await fetch(`${supabaseUrl}/functions/v1/search-stock-music`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `${style} ${mood}`,
        limit: 5, // r39C: fetch 5 candidates instead of 1
      }),
    });

    if (searchResponse.ok) {
      const { results } = await searchResponse.json();
      if (results?.length) {
        // r39C: Validate each track via HEAD request
        for (const track of results) {
          const url = track?.url;
          if (!url) continue;
          try {
            const headResp = await fetch(url, { method: 'HEAD' });
            if (!headResp.ok) {
              console.warn(`[selectBackgroundMusic] r39C HEAD failed for ${url}: ${headResp.status}`);
              continue;
            }
            const contentType = headResp.headers.get('content-type') || '';
            const contentLength = parseInt(headResp.headers.get('content-length') || '0', 10);
            if (!contentType.startsWith('audio/') && !contentType.includes('mpeg') && !contentType.includes('mp3')) {
              console.warn(`[selectBackgroundMusic] r39C invalid content-type: ${contentType} for ${url}`);
              continue;
            }
            if (contentLength < 10000) { // < 10KB is likely corrupt/error page
              console.warn(`[selectBackgroundMusic] r39C too small: ${contentLength} bytes for ${url}`);
              continue;
            }
            console.log(`[selectBackgroundMusic] r39C validated: ${url} (${contentType}, ${contentLength} bytes)`);
            return url;
          } catch (headErr) {
            console.warn(`[selectBackgroundMusic] r39C HEAD error for ${url}:`, headErr);
            continue;
          }
        }
        console.warn(`[selectBackgroundMusic] r39C: All ${results.length} candidates failed validation, using fallback`);
      }
    }
  } catch (e) {
    console.error('[auto-generate-universal-video] Music search failed:', e);
  }

  // r39C: Known-good fallback URLs (verified working Pixabay CDN)
  const MUSIC_FALLBACK: Record<string, string> = {
    'upbeat': 'https://cdn.pixabay.com/audio/2024/11/12/audio_c09a6e2f0d.mp3',
    'calm': 'https://cdn.pixabay.com/audio/2024/09/10/audio_6e5d7d1912.mp3',
    'corporate': 'https://cdn.pixabay.com/audio/2022/10/25/audio_b36e8b618a.mp3',
    'inspirational': 'https://cdn.pixabay.com/audio/2024/04/17/audio_db71c3e9ba.mp3',
    'energetic': 'https://cdn.pixabay.com/audio/2023/07/13/audio_3d4a5a0c0b.mp3',
  };

  return MUSIC_FALLBACK[mood] || MUSIC_FALLBACK['corporate'];
}

async function generateSVGPlaceholder(title: string, color?: string): Promise<string> {
  const bgColor = color || '#3b82f6';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
        <stop offset="100%" style="stop-color:#1e293b;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#bg)"/>
    <text x="960" y="540" font-family="Arial, sans-serif" font-size="48" fill="white" text-anchor="middle" dominant-baseline="middle">${title || 'Scene'}</text>
  </svg>`;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const fileName = `placeholders/${crypto.randomUUID()}.svg`;
    const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
    
    const { error } = await supabase.storage
      .from('video-assets')
      .upload(fileName, svgBlob, {
        contentType: 'image/svg+xml',
        upsert: false,
      });

    if (!error) {
      const { data: urlData } = supabase.storage
        .from('video-assets')
        .getPublicUrl(fileName);
      if (urlData?.publicUrl) {
        return urlData.publicUrl;
      }
    }
    console.warn(`[auto-generate-universal-video] SVG upload failed:`, error);
  } catch (e) {
    console.warn(`[auto-generate-universal-video] SVG upload error:`, e);
  }

  return `https://placehold.co/1920x1080/${bgColor.replace('#', '')}/${bgColor.replace('#', '')}?text=+`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function transformAlignmentToPhonemes(alignment: {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
}): Array<{ character: string; start_time: number; end_time: number }> {
  if (!alignment?.characters || !alignment?.character_start_times_seconds || !alignment?.character_end_times_seconds) {
    return [];
  }

  const phonemes: Array<{ character: string; start_time: number; end_time: number }> = [];
  
  for (let i = 0; i < alignment.characters.length; i++) {
    const char = alignment.characters[i];
    const startTime = alignment.character_start_times_seconds[i];
    const endTime = alignment.character_end_times_seconds[i];
    
    if (char && char.trim() && typeof startTime === 'number' && typeof endTime === 'number') {
      phonemes.push({
        character: char,
        start_time: startTime,
        end_time: endTime,
      });
    }
  }
  
  return phonemes;
}

function getDefaultAnimation(sceneType: string): string {
  const map: Record<string, string> = {
    hook: 'zoomIn', intro: 'fadeIn', problem: 'slideLeft',
    solution: 'slideRight', feature: 'slideUp', proof: 'fadeIn',
    cta: 'bounce', outro: 'fadeIn', transition: 'fadeIn',
  };
  return map[sceneType] || 'fadeIn';
}

function getDefaultTextAnimation(sceneType: string): string {
  const map: Record<string, string> = {
    hook: 'bounceIn', intro: 'typewriter', problem: 'fadeWords',
    solution: 'highlight', feature: 'splitReveal', proof: 'fadeWords',
    cta: 'glowPulse', outro: 'fadeWords', transition: 'none',
  };
  return map[sceneType] || 'fadeWords';
}

function getDefaultSoundEffect(sceneType: string): string {
  const map: Record<string, string> = {
    hook: 'whoosh', intro: 'none', problem: 'alert',
    solution: 'success', feature: 'pop', proof: 'none',
    cta: 'success', outro: 'none', transition: 'whoosh',
  };
  return map[sceneType] || 'none';
}
