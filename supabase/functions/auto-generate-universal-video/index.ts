import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const AUTO_GEN_BUILD_TAG = "r56-phase12-fallback-fix-2026-03-19";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";
import { normalizeStartPayload, buildStrictMinimalPayload, payloadDiagnostics, calculateFramesPerLambda, calculateScheduling, determineSchedulingMode, LAMBDA_TIMEOUT_SECONDS, type SchedulingMode } from "../_shared/remotion-payload.ts";
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
const VALID_STYLES = ['flat-design', 'isometric', 'whiteboard', 'comic', 'corporate', 'modern-3d', 'cinematic', 'documentary', 'minimalist', 'bold-colorful', 'vintage-retro', 'hand-drawn', 'motion-graphics', 'photo-realistic', 'cartoon', 'watercolor', 'neon-cyberpunk', 'paper-cutout', 'clay-3d', 'anime'] as const;
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

  console.log(`[auto-generate-universal-video] BUILD_TAG=${AUTO_GEN_BUILD_TAG}`);
  const serveStartTime = Date.now();
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
      
      let existingResultData = existingProgress.result_data as any;
      
      // r43: If lambdaPayload is missing, try to load from chain source (sourceProgressId)
      if (!existingResultData?.lambdaPayload) {
        const fallbackSourceId = existingResultData?.sourceProgressId;
        console.log(`[auto-generate-universal-video] ⚠️ r43: No lambdaPayload in ${existingProgressId}, trying sourceProgressId: ${fallbackSourceId}`);
        
        if (fallbackSourceId) {
          const { data: sourceProgress, error: sourceErr } = await supabase
            .from('universal_video_progress')
            .select('result_data')
            .eq('id', fallbackSourceId)
            .single();
          
          if (!sourceErr && (sourceProgress?.result_data as any)?.lambdaPayload) {
            console.log(`[auto-generate-universal-video] ✅ r43: Found lambdaPayload in source ${fallbackSourceId}`);
            existingResultData = { ...existingResultData, ...(sourceProgress.result_data as any) };
          }
        }
        
        // If STILL no payload after fallback, return structured 4xx (not 500)
        if (!existingResultData?.lambdaPayload) {
          console.warn(`[auto-generate-universal-video] ❌ r43: No lambdaPayload found in chain. Returning structured error.`);
          return new Response(JSON.stringify({
            error: 'render_only_source_missing_payload',
            message: 'Kein wiederverwendbarer Render-Payload gefunden. Bitte starte eine neue Generierung.',
          }), {
            status: 422,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
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
      // r44: Profile A now uses SVG characters + emoji icons (no <Lottie> mount in Lambda)
      // All visual effects remain ACTIVE: SceneFx, FloatingIcons, AnimatedText, Subtitles, KenBurns
      'A': { forceCharacterSvg: true, forceLottieIconsEmoji: true },
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

  const pipelineStartTime = Date.now();
  const pipelineTimeoutMs = 280_000; // 280s of 300s budget — leave 20s safety margin
  console.log(`[auto-generate-universal-video] runGenerationPipeline BUILD_TAG=${AUTO_GEN_BUILD_TAG}`);

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
      body: JSON.stringify({ briefing: { ...briefing, moodConfig: briefing.moodConfig } }),
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

    // Step 3: Generate Scene Visuals (25% - 60%) - SEQUENTIAL BATCHES to avoid rate limits
    // Hook/CTA scenes are generated FIRST with more retries (5 instead of 3)
    const totalScenes = script.scenes.length;
    await updateProgress(supabase, progressId, 'generating_visuals', 30, `🎨 ${totalScenes} Szenen-Bilder werden erstellt...`);

    const BATCH_SIZE = 2;
    const sceneVisuals: (string | null)[] = new Array(script.scenes.length).fill(null);

    // Separate scenes into priority (hook/cta) and normal
    const priorityIndices: number[] = [];
    const normalIndices: number[] = [];
    script.scenes.forEach((scene: any, i: number) => {
      const sceneType = (scene.sceneType || scene.type || '').toLowerCase();
      if (['hook', 'cta', 'intro', 'outro'].includes(sceneType) || i === 0 || i === script.scenes.length - 1) {
        priorityIndices.push(i);
      } else {
        normalIndices.push(i);
      }
    });

    console.log(`[auto-generate-universal-video] Priority scenes (hook/cta/first/last): [${priorityIndices.join(',')}], Normal: [${normalIndices.join(',')}]`);

    // Helper to generate a single scene visual
    const generateSceneVisual = async (i: number, maxRetries: number): Promise<string> => {
      const scene = script.scenes[i];
      const sceneType = (scene.sceneType || scene.type || 'feature').toLowerCase();
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        // TIME-BUDGET GUARD: If less than 60s remain, skip retries and go straight to SVG fallback
        const elapsedMs = Date.now() - pipelineStartTime;
        const remainingMs = pipelineTimeoutMs - elapsedMs;
        if (remainingMs < 60_000) {
          console.warn(`[auto-generate-universal-video] ⏰ TIME-BUDGET: Only ${Math.round(remainingMs / 1000)}s remaining. Skipping retry ${attempt + 1}/${maxRetries} for scene ${i + 1}, using immediate SVG fallback.`);
          return await generateSVGFallbackToStorage(
            scene.title,
            briefing.brandColors?.[0],
            briefing.brandColors?.[1],
            supabaseUrl,
            supabaseServiceKey
          );
        }
        
        try {
          // Enhanced prompt engineering for Loft-Film quality
          const categoryStyleHints: Record<string, string> = {
            'storytelling': 'cinematic, warm lighting, shallow depth of field, dramatic composition',
            'corporate': 'clean, professional, modern office environment, business atmosphere',
            'tutorial': 'bright, clear, well-organized, educational diagram style',
            'advertisement': 'bold, vibrant, eye-catching, product-focused, high contrast',
            'social-content': 'trendy, colorful, dynamic, social media optimized',
            'testimonial': 'authentic, warm, personal, soft lighting, portrait style',
            'presentation': 'clean, structured, infographic style, data visualization',
            'explainer': 'illustrated, clear metaphors, concept visualization, flat design',
          };
          const categoryHint = categoryStyleHints[briefing.category || ''] || 'professional, high quality';
          
          const sceneStyleHints: Record<string, string> = {
            'hook': 'dramatic, attention-grabbing, bold composition, central focal point',
            'problem': 'moody, tense atmosphere, visual tension, dark undertones',
            'solution': 'bright, optimistic, open space, positive energy, uplifting',
            'feature': 'detailed, showcase, close-up, product detail, clean background',
            'proof': 'trustworthy, data-driven, charts, statistics visualization',
            'cta': 'clean minimal abstract background, soft gradient or bokeh effect, NO people, NO silhouettes, NO human figures, NO busy illustrations, calm and focused',
          };
          const sceneHint = sceneStyleHints[sceneType] || 'professional, well-composed';

          const aspectHint = briefing.aspectRatio === '9:16' ? 'vertical portrait composition (9:16)' : 'wide landscape composition (16:9)';
          // ✅ Phase 11: Product context injection + anti-text as SHORT suffix
          const productContext = briefing.productDescription
            ? `Context: "${briefing.companyName || briefing.productName || 'digital product'}" - ${(briefing.productDescription || '').slice(0, 120)}. `
            : '';
          const antiTextSuffix = 'STRICT: This image must contain ZERO text, ZERO numbers, ZERO digits, ZERO percentages, ZERO labels, ZERO letters, ZERO words. No dashboard numbers, no analytics data, no statistics, no charts with values, no data visualizations. No QR codes, no logos, no UI mockups, no screenshots, no watermarks. ABSOLUTELY NO human figures, people, silhouettes, hands, fingers, or body parts — replace any human subjects with empty furniture, equipment, or open space. Show ONLY the environment and objects.';
          
          // Phase 15: Keyword sanitizer — replace text-bearing objects before prompt construction
          const sanitizeVisualDescription = (desc: string): string => {
            return desc
              .replace(/\bdashboard(s)?\b/gi, 'desk setup')
              .replace(/\bcalendar(s)?\b/gi, 'organized workspace')
              .replace(/\banalytics?\b/gi, 'clean workspace')
              .replace(/\bchart(s)?\b/gi, 'clean workspace')
              .replace(/\bgraph(s)?\b/gi, 'clean workspace')
              .replace(/\bstatistic(s)?\b/gi, 'clean workspace')
              .replace(/\bspreadsheet(s)?\b/gi, 'office supplies')
              .replace(/\bmonitor(s)?\s+showing\b/gi, 'monitor on a desk with')
              .replace(/\bscreen(s)?\s+displaying\b/gi, 'screen on a desk with')
              .replace(/\bdata\s+visualization(s)?\b/gi, 'tidy workspace')
              .replace(/\binfographic(s)?\b/gi, 'clean layout')
              .replace(/\bdiagram(s)?\b/gi, 'workspace')
              .replace(/\bUI\b/gi, 'interface design')
              .replace(/\bwhiteboard(s)?\s+with\s+notes?\b/gi, 'whiteboard')
              .replace(/\btable(s)?\s+with\s+data\b/gi, 'table with objects');
          };
          
          const sanitizedVisualDesc = sanitizeVisualDescription(scene.visualDescription || '');
          
          // Phase 14: visualStyle as dominant signal, sceneStyleHints as subtle mood only
          const prompt = attempt === 0
            ? `ART STYLE: ${briefing.visualStyle}. ${productContext}${sanitizedVisualDesc}. Subtle mood: ${sceneHint}. ${categoryHint}. ${aspectHint}. Professional quality, ${briefing.emotionalTone} mood. Brand colors: ${Array.isArray(briefing.brandColors) ? briefing.brandColors.join(', ') : (briefing.brandColors || 'professional palette')}. IMPORTANT: Maintain exact same visual art style across all scenes. ${antiTextSuffix}`
            : `ART STYLE: ${briefing.visualStyle}. ${productContext}Professional ${sceneType} scene for ${briefing.companyName || briefing.productName || 'business'}. ${categoryHint}. ${aspectHint}. IMPORTANT: Maintain exact same visual art style across all scenes. ${antiTextSuffix}`;

          const visualResponse = await fetch(`${supabaseUrl}/functions/v1/generate-premium-visual`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              sceneDescription: prompt,
              type: 'scene',
              style: briefing.visualStyle,
              aspectRatio: briefing.aspectRatio,
              characterSheetUrl: characterSheetUrl,
            }),
          });

          if (visualResponse.ok) {
            const { imageUrl } = await visualResponse.json();
            console.log(`[auto-generate-universal-video] Scene ${i + 1} visual generated (attempt ${attempt + 1}/${maxRetries})`);
            return imageUrl;
          } else {
            const errorText = await visualResponse.text();
            console.error(`[auto-generate-universal-video] Scene ${i + 1} visual failed (attempt ${attempt + 1}/${maxRetries}):`, visualResponse.status, errorText);
            if (attempt < maxRetries - 1) {
              await delay(2000 * (attempt + 1));
            }
          }
        } catch (e) {
          console.error(`[auto-generate-universal-video] Scene ${i + 1} visual error (attempt ${attempt + 1}/${maxRetries}):`, e);
          if (attempt < maxRetries - 1) {
            await delay(2000 * (attempt + 1));
          }
        }
      }

      // All retries failed — go DIRECTLY to SVG fallback (skip Gemini — too slow for Edge Function budget)
      console.warn(`[auto-generate-universal-video] Scene ${i + 1}: All ${maxRetries} retries failed, using immediate SVG fallback (skipping Gemini)`);
      return await generateSVGFallbackToStorage(
        scene.title,
        briefing.brandColors?.[0],
        briefing.brandColors?.[1],
        supabaseUrl,
        supabaseServiceKey
      );
    };

    // Phase A: Generate priority scenes FIRST (5 retries each, batch of 2)
    for (let batchStart = 0; batchStart < priorityIndices.length; batchStart += BATCH_SIZE) {
      const batch = priorityIndices.slice(batchStart, batchStart + BATCH_SIZE);
      const results = await Promise.all(batch.map(i => generateSceneVisual(i, 5)));
      batch.forEach((idx, j) => { sceneVisuals[idx] = results[j]; });

      const completedCount = sceneVisuals.filter(v => v !== null).length;
      const progress = 30 + Math.floor((completedCount / totalScenes) * 30);
      await updateProgress(supabase, progressId, 'generating_visuals', progress, `🎨 ${completedCount}/${totalScenes} Szenen-Bilder fertig (Priorität)...`);
      if (batchStart + BATCH_SIZE < priorityIndices.length) await delay(500);
    }

    // Phase B: Generate remaining scenes (2 retries each, batch of 2) — reduced from 3 to save time budget
    for (let batchStart = 0; batchStart < normalIndices.length; batchStart += BATCH_SIZE) {
      const batch = normalIndices.slice(batchStart, batchStart + BATCH_SIZE);
      const results = await Promise.all(batch.map(i => generateSceneVisual(i, 2)));
      batch.forEach((idx, j) => { sceneVisuals[idx] = results[j]; });

      const completedCount = sceneVisuals.filter(v => v !== null).length;
      const progress = 30 + Math.floor((completedCount / totalScenes) * 30);
      await updateProgress(supabase, progressId, 'generating_visuals', progress, `🎨 ${completedCount}/${totalScenes} Szenen-Bilder fertig...`);
      if (batchStart + BATCH_SIZE < normalIndices.length) await delay(500);
    }

    sceneVisuals.forEach((url: string | null, i: number) => {
      if (url) script.scenes[i].imageUrl = url;
    });

    // ═══════════════════════════════════════════════════════════════
    // r46: ASSET NORMALIZATION — Download + Re-Upload every image as stable PNG
    // Eliminates: Replicate temp-URLs, WebP issues, DNS variance between Edge & Lambda
    // ═══════════════════════════════════════════════════════════════
    const normalizeClient = createClient(supabaseUrl, supabaseServiceKey);
    let normalizedCount = 0;
    let fallbackCount = 0;
    let gradientForcedCount = 0;
    let skippedCount = 0;

    // r47: Parallel normalization with Promise.allSettled — prevents single scene from crashing entire loop
    try {
      const normalizeScene = async (i: number) => {
        const scene = script.scenes[i];
        if (!scene.imageUrl || !scene.imageUrl.startsWith('http')) {
          console.log(`[asset-normalize] Scene ${i + 1}: no imageUrl, skipping`);
          skippedCount++;
          return;
        }

        try {
          // Step 1: Download the image (10s timeout)
          const dlController = new AbortController();
          const dlTimeout = setTimeout(() => dlController.abort(), 10000);
          const dlResp = await fetch(scene.imageUrl, { signal: dlController.signal });
          clearTimeout(dlTimeout);

          if (!dlResp.ok) throw new Error(`GET returned ${dlResp.status}`);

          const imageBytes = new Uint8Array(await dlResp.arrayBuffer());
          if (imageBytes.length < 2000) throw new Error(`Image too small: ${imageBytes.length} bytes`);

          // r49: MAGIC-BYTE FORMAT DETECTION — detect actual format instead of assuming JPEG
          let detectedContentType = 'image/jpeg';
          let detectedExt = '.jpg';
          if (imageBytes.length >= 12) {
            // WebP: starts with "RIFF" + 4 bytes + "WEBP"
            if (imageBytes[0] === 0x52 && imageBytes[1] === 0x49 && imageBytes[2] === 0x46 && imageBytes[3] === 0x46 &&
                imageBytes[8] === 0x57 && imageBytes[9] === 0x45 && imageBytes[10] === 0x42 && imageBytes[11] === 0x50) {
              detectedContentType = 'image/webp';
              detectedExt = '.webp';
            }
            // PNG: starts with 0x89 0x50 0x4E 0x47
            else if (imageBytes[0] === 0x89 && imageBytes[1] === 0x50 && imageBytes[2] === 0x4E && imageBytes[3] === 0x47) {
              detectedContentType = 'image/png';
              detectedExt = '.png';
            }
            // JPEG: starts with 0xFF 0xD8
            else if (imageBytes[0] === 0xFF && imageBytes[1] === 0xD8) {
              detectedContentType = 'image/jpeg';
              detectedExt = '.jpg';
            }
            // GIF: starts with "GIF8"
            else if (imageBytes[0] === 0x47 && imageBytes[1] === 0x49 && imageBytes[2] === 0x46 && imageBytes[3] === 0x38) {
              detectedContentType = 'image/gif';
              detectedExt = '.gif';
            }
          }
          console.log(`[asset-normalize] Scene ${i + 1}: detected format=${detectedContentType} (${imageBytes.length} bytes)`);

          // Step 2: Re-upload with CORRECT content-type and extension
          const stableFileName = `render-ready/scene-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${detectedExt}`;
          const { error: upErr } = await normalizeClient.storage
            .from('video-assets')
            .upload(stableFileName, imageBytes, { contentType: detectedContentType, upsert: true });

          if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

          const { data: pubData } = normalizeClient.storage
            .from('video-assets')
            .getPublicUrl(stableFileName);

          if (!pubData?.publicUrl) throw new Error('No public URL returned');

          // Step 3: Verify the new URL is accessible (3s timeout)
          const verifyController = new AbortController();
          const verifyTimeout = setTimeout(() => verifyController.abort(), 3000);
          try {
            const verifyResp = await fetch(pubData.publicUrl, { method: 'HEAD', signal: verifyController.signal });
            clearTimeout(verifyTimeout);
            if (!verifyResp.ok) throw new Error(`Verify GET returned ${verifyResp.status}`);
          } catch (verifyErr: any) {
            clearTimeout(verifyTimeout);
            throw new Error(`Verify failed: ${verifyErr.message}`);
          }

          script.scenes[i].imageUrl = pubData.publicUrl;
          normalizedCount++;
          console.log(`[asset-normalize] Scene ${i + 1}: ${imageBytes.length} bytes re-uploaded+verified → ${pubData.publicUrl.slice(0, 80)}`);
        } catch (normErr: any) {
          console.warn(`[asset-normalize] Scene ${i + 1} normalization failed (${normErr.message}), trying SVG fallback...`);
          try {
            const fallbackUrl = await generateSVGFallbackToStorage(
              scene.title || `Scene ${i + 1}`,
              briefing.brandColors?.[0],
              briefing.brandColors?.[1],
              supabaseUrl,
              supabaseServiceKey
            );
            if (fallbackUrl.startsWith('data:')) {
              throw new Error('SVG fallback returned data-URI');
            }
            script.scenes[i].imageUrl = fallbackUrl;
            fallbackCount++;
            console.log(`[asset-normalize] Scene ${i + 1} replaced with SVG fallback: ${fallbackUrl.slice(0, 80)}`);
          } catch (fbErr: any) {
            console.error(`[asset-normalize] Scene ${i + 1} all fallbacks failed, forcing gradient background`);
            script.scenes[i].imageUrl = undefined;
            script.scenes[i].background = {
              type: 'gradient',
              gradientColors: [briefing.brandColors?.[0] || '#1e293b', briefing.brandColors?.[1] || '#0f172a'],
            };
            gradientForcedCount++;
          }
        }
      };

      // Run all scenes in parallel
      const results = await Promise.allSettled(
        script.scenes.map((_: unknown, i: number) => normalizeScene(i))
      );

      // Log any unexpected rejections
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`[asset-normalize] Scene ${i + 1} unexpected rejection: ${r.reason}`);
          // Force gradient as ultimate safety net
          if (script.scenes[i]) {
            script.scenes[i].imageUrl = undefined;
            script.scenes[i].background = {
              type: 'gradient',
              gradientColors: [briefing.brandColors?.[0] || '#1e293b', briefing.brandColors?.[1] || '#0f172a'],
            };
            gradientForcedCount++;
          }
        }
      });
    } catch (outerNormErr: any) {
      console.error(`[asset-normalize] OUTER LOOP CRASH: ${outerNormErr.message}`);
    }

    console.log(`[asset-normalize] SUMMARY: ${normalizedCount} normalized, ${fallbackCount} SVG, ${gradientForcedCount} gradient, ${skippedCount} skipped (of ${script.scenes.length} total)`);

    // ═══════════════════════════════════════════════════════════════
    // r50: STRICT POST-NORMALIZATION VALIDATION
    // The r42 S3 bundle has NO SafeImg fallback — if an image fails to load,
    // it renders BLACK. We must guarantee every image is accessible BEFORE
    // sending to Lambda, or force gradient (which the bundle handles correctly).
    // ═══════════════════════════════════════════════════════════════
    const SCENE_TYPE_GRADIENTS: Record<string, [string, string]> = {
      'hook':       ['#f59e0b', '#d97706'],  // Amber
      'problem':    ['#ef4444', '#b91c1c'],  // Red
      'solution':   ['#10b981', '#059669'],  // Green
      'feature':    ['#3b82f6', '#1d4ed8'],  // Blue
      'proof':      ['#8b5cf6', '#6d28d9'],  // Purple
      'cta':        ['#f97316', '#ea580c'],  // Orange
      'intro':      ['#06b6d4', '#0891b2'],  // Cyan
      'outro':      ['#6366f1', '#4f46e5'],  // Indigo
      'transition': ['#64748b', '#475569'],  // Slate
    };

    let r50ValidatedCount = 0;
    let r50GradientForcedCount = 0;

    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i];
      if (!scene.imageUrl || !scene.imageUrl.startsWith('http')) {
        continue; // Already gradient or no image
      }

      try {
        const validateStart = Date.now();
        const valController = new AbortController();
        const valTimeout = setTimeout(() => valController.abort(), 2000); // 2s strict timeout
        const valResp = await fetch(scene.imageUrl, { signal: valController.signal });
        clearTimeout(valTimeout);

        const valBody = await valResp.arrayBuffer();
        const downloadMs = Date.now() - validateStart;

        // Strict checks:
        // 1. HTTP 200
        // 2. Body > 5000 bytes (small files are often error pages or corrupt)
        // 3. Download completed in < 3s (Lambda will be even slower under load)
        if (!valResp.ok || valBody.byteLength < 5000 || downloadMs > 3000) {
          throw new Error(`r50: status=${valResp.status}, size=${valBody.byteLength}, time=${downloadMs}ms`);
        }

        r50ValidatedCount++;
        console.log(`[r50-validate] Scene ${i + 1}: ✅ OK (${valBody.byteLength} bytes, ${downloadMs}ms)`);
      } catch (valErr: any) {
        const sceneType = (scene.sceneType || scene.type || 'feature').toLowerCase();
        const gradientPair = SCENE_TYPE_GRADIENTS[sceneType] || SCENE_TYPE_GRADIENTS['feature'];

        console.warn(`[r50-validate] Scene ${i + 1}: ❌ FAILED (${valErr.message}) → forcing gradient [${gradientPair}]`);
        script.scenes[i].imageUrl = undefined;
        script.scenes[i].background = {
          type: 'gradient',
          gradientColors: gradientPair,
        };
        r50GradientForcedCount++;
      }
    }

    console.log(`[r50-validate] SUMMARY: ${r50ValidatedCount} validated, ${r50GradientForcedCount} forced to gradient`);

    await updateProgress(supabase, progressId, 'visuals_complete', 60, '✅ Alle Szenen-Bilder fertig!', { sceneVisuals, r47_assetNormalize: { normalized: normalizedCount, svgFallback: fallbackCount, gradientForced: gradientForcedCount, skipped: skippedCount }, r50_validation: { validated: r50ValidatedCount, gradientForced: r50GradientForcedCount } });

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
    
    // r39B: Determine scheduling mode (canary rollout)
    const schedulingMode = determineSchedulingMode();
    console.log(`[auto-generate-universal-video] r39B schedulingMode: ${schedulingMode}`);
    
    // r55-phase5: Loft-Film quality — ALWAYS 30fps, no reduction allowed
    // With graduated stability scheduling (1/2/3 lambdas), 30fps fits within budget
    let mainScheduling = calculateScheduling(durationInFrames, { schedulingMode });
    console.log(`[auto-generate-universal-video] r55-phase5: LOCKED at ${fps}fps (Loft-Film policy), scheduling handles capacity via ${mainScheduling.estimatedLambdas} lambdas`);
    
    // r43: SOFT GUARD — if STILL over budget even at 15fps, LOG WARNING but continue with forensic flag
    // (Previously this was a hard throw, which blocked 60s videos unnecessarily)
    let r43_budgetOverride = false;
    if (mainScheduling.timeoutBudgetOk === false) {
      r43_budgetOverride = true;
      console.warn(`[auto-generate-universal-video] ⚠️ r43 SOFT GUARD: Est. runtime ${mainScheduling.estRuntimeSec?.toFixed(0)}s exceeds ${LAMBDA_TIMEOUT_SECONDS}s timeout at ${fps}fps. Duration: ${totalDuration}s, Frames: ${durationInFrames}. Proceeding with forensic flag.`);
    }
    
    console.log(`[auto-generate-universal-video] r43 scheduling: mode=${schedulingMode}, fps=${fps}, frames=${durationInFrames}, fpl=${mainScheduling.framesPerLambda}, lambdas=${mainScheduling.estimatedLambdas}, estRuntime=${mainScheduling.estRuntimeSec?.toFixed(1)}s, budgetOk=${mainScheduling.timeoutBudgetOk}, budgetOverride=${r43_budgetOverride}`);

    const remotionScenes = script.scenes.map((scene: any, index: number) => {
      const startTime = script.scenes.slice(0, index).reduce((acc: number, s: any) =>
        acc + (s.durationSeconds || s.duration || 5), 0);
      const duration = scene.durationSeconds || scene.duration || 5;
      const sceneType = validateEnum(scene.sceneType || scene.type || 'content', VALID_SCENE_TYPES, 'feature');

      // r55: All animations unlocked (r55-bundle has dimension fixes for PopIn/FlyIn)
      const imageUrl = scene.imageUrl || scene.image_url || undefined;
      const rawAnimation = scene.animation || getDefaultAnimation(sceneType);
      const hasImage = !!imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http');

      // Animation guard: kenBurns only with images (no other blacklist needed with r55 bundle)
      let finalAnimation = rawAnimation;
      if (finalAnimation === 'kenBurns' && !hasImage) {
        finalAnimation = 'fadeIn';
      }

      // r55: Scene-type-based transitions instead of always 'fade'
      const rawTransition = scene.transition?.type || scene.transitionType || getDefaultTransition(sceneType);
      const finalTransition = rawTransition;

      // Background: image if available, otherwise gradient with brand colors
      const sceneBackground = hasImage
        ? { type: 'image' as const, imageUrl }
        : {
            type: 'gradient' as const,
            gradientColors: scene.background?.gradientColors ||
              [briefing.brandColors?.[0] || '#3b82f6', briefing.brandColors?.[1] || '#1e40af'],
          };

      return {
        id: `scene-${index}`,
        order: index + 1,
        type: sceneType,
        title: scene.title || '',
        duration,
        startTime,
        endTime: startTime + duration,
        background: sceneBackground,
        animation: validateEnum(finalAnimation, VALID_ANIMATIONS, 'fadeIn'),
        kenBurnsDirection: validateEnum(scene.kenBurnsDirection || 'in', ['in', 'out', 'left', 'right'], 'in'),
        textOverlay: {
          enabled: true,
          // Phase 12: CTA/outro scenes get more room for URL + call-to-action
          text: smartTruncateToSentences(
            scene.voiceover || scene.title || '',
            (sceneType === 'cta' || sceneType === 'outro') ? 2 : 1,
            (sceneType === 'cta' || sceneType === 'outro') ? 25 : 15
          ),
          headline: scene.title || '',
          animation: validateEnum(scene.textAnimation || getDefaultTextAnimation(sceneType), VALID_TEXT_ANIMATIONS, 'fadeWords'),
          position: validateEnum(scene.textPosition || getDefaultTextPosition(sceneType), VALID_TEXT_POSITIONS, 'bottom'),
        },
        soundEffectType: validateEnum(scene.soundEffect || getDefaultSoundEffect(sceneType), VALID_SOUND_EFFECTS, 'none'),
        beatAligned: scene.beatAligned === true,
        transition: {
          type: validateEnum(finalTransition, VALID_TRANSITION_TYPES, 'fade'),
          duration: finalTransition === 'none' ? 0 : 0.5,
          direction: scene.transition?.direction || 'right',
        },
      };
    });

    const sanitizedBeatSync = sanitizeBeatSyncData(beatSyncData);

    // r55: All visual systems enabled (r55-bundle fixes dimension bugs)
    const disableMorphTransitions = false;
    const disableLottieIcons = profileFlags.disableLottieIcons === true || profileFlags.forceLottieIconsEmoji === true;
    const forceEmbeddedCharacterLottie = true;
    const disablePrecisionSubtitles = profileFlags.disablePrecisionSubtitles === true;
    const disableSceneFx = false;
    const disableAnimatedText = false;
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
        type: 'color' as const,
        color: '#3b82f6',
      },
      animation: 'none' as const,
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
        type: 'none' as const,
        duration: 0,
        direction: 'right',
      },
    }] : remotionScenes;

    const compositionDurationInFrames = isBareMinimum ? 60 : durationInFrames;
    let runningStartFrame = 0;
    const sceneFrameTimeline = finalScenes.map((scene: any) => {
      const durationFrames = Math.max(1, Math.ceil((scene.duration || 5) * fps));
      const startFrame = runningStartFrame;
      runningStartFrame += durationFrames;
      return {
        id: scene.id,
        type: scene.type,
        startTime: scene.startTime,
        durationSeconds: scene.duration,
        startFrame,
        durationFrames,
        animation: scene.animation,
        transitionType: scene.transition?.type || 'none',
        backgroundType: scene.background?.type || 'unknown',
      };
    });
    const totalSceneFrames = sceneFrameTimeline.reduce((acc: number, s: any) => acc + s.durationFrames, 0);
    const frameOverflow = totalSceneFrames - compositionDurationInFrames;
    const timingDiagnostics = {
      totalSceneFrames,
      compositionDurationInFrames,
      frameOverflow,
      hasTimingOverflow: frameOverflow > 0,
      sceneTypes: finalScenes.map((s: any) => s.type),
      sceneDurations: finalScenes.map((s: any) => s.duration),
      sceneStartTimes: finalScenes.map((s: any) => s.startTime),
      sceneTimeline: sceneFrameTimeline,
    };

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
      // r44: forceCharacterSvg ensures SVG character (no <Lottie> mount) while keeping character visible
      characterType: isBareMinimum ? 'svg' : ((disableCharacter || disableAllLottie || profileFlags.forceCharacterSvg) ? 'svg' : validateEnum(briefing.characterType, ['svg', 'lottie', 'rive'], 'lottie')),
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
      showSceneTitles: isBareMinimum ? false : true,
      showProgressBar: isBareMinimum ? false : (briefing.showProgressBar !== false),
      showWatermark: isBareMinimum ? false : (briefing.showWatermark === true),
      watermarkText: isBareMinimum ? undefined : (briefing.watermarkText || undefined),
      brandUrl: briefing.websiteUrl || briefing.companyName || undefined,
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
        silentRender: true, // r41: always render silent, mux audio afterwards
        sanitizerVersion: 'v11-r43-softGuard',
        diagnosticProfile: diagProfile,
        ...(r43_budgetOverride ? { r43_budgetOverride: true, r43_estRuntimeSec: mainScheduling.estRuntimeSec } : {}),
      },
    }) as Record<string, unknown>;

    const inputPropsDiagnostics = {
      canary: 'payload-sanitizer-v13-r55-phase5-quality-jump',
      category: (inputProps as any).category,
      storytellingStructure: (inputProps as any).storytellingStructure,
      style: (inputProps as any).style,
      characterType: (inputProps as any).characterType,
      useCharacter: (inputProps as any).useCharacter,
      sceneCount: finalScenes.length,
      sceneTypes: finalScenes.map((s: any) => s.type),
      sceneAnimations: finalScenes.map((s: any) => s.animation),
      hasBeatSync: !!sanitizedBeatSync,
      hasVoiceover: !!voiceoverUrl,
      hasMusic: !!musicUrl,
      hasPhonemes: !!(phonemeTimestamps && phonemeTimestamps.length > 0),
      hasSubtitleStyle: !!(inputProps as any).subtitleStyle,
      timingDiagnostics,
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
      content_config: {
        category: briefing.category,
        scenes: finalScenes.length,
        hasVoiceover: !!voiceoverUrl,
        hasMusic: !!musicUrl,
        credits_used: credits_required,
        diagnosticProfile: diagProfile,
        diag_flags: (inputProps as any).diag,
        progressId: progressId,
        schedulingMode,
        r53_nuclear_diagnostic: true,
        scene_backgrounds: finalScenes.map((s: any) => s.background?.type),
        scene_animations: finalScenes.map((s: any) => s.animation),
        scene_types: finalScenes.map((s: any) => s.type),
        scene_durations: finalScenes.map((s: any) => s.duration),
        scene_start_times: finalScenes.map((s: any) => s.startTime),
        timing_diagnostics: timingDiagnostics,
        remotion_scenes: finalScenes,
      },
      subtitle_config: {},
      status: 'pending',
      started_at: new Date().toISOString(),
      user_id: userId,
      source: 'universal-creator',
    });

    // r39: Build Lambda payload with scheduling mode (stability or distributed)
    console.log(`🔄 Building and normalizing Lambda payload for Remotion 4.0.424 (r39 ${schedulingMode})`);
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
      durationInFrames: compositionDurationInFrames,
      fps: fps,
      width: dimensions.width,
      height: dimensions.height,
      _schedulingMode: schedulingMode, // r39B: pass scheduling mode
      _silentRender: true, // r41: force muted + no audioCodec
      muted: true, // r41: explicit muted flag
      webhook: {
        url: webhookUrl,
        secret: null,
        customData: {
          pending_render_id: pendingRenderId,
          out_name: `universal-video-${pendingRenderId}.mp4`,
          user_id: userId,
          credits_used: credits_required,
          source: 'universal-creator',
          progressId: progressId,
          // r41: Store audio URLs for post-render muxing
          silentRender: true,
          audioTracks: {
            voiceoverUrl: isBareMinimum ? undefined : (voiceoverUrl || undefined),
            backgroundMusicUrl: isBareMinimum ? undefined : (musicUrl || undefined),
            backgroundMusicVolume: isBareMinimum ? 0 : 0.3,
          },
        },
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
      r53_nuclear_diagnostic: true,
      timingDiagnostics,
      remotionScenes: finalScenes,
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
    
    // r43: Cleanup orphan pending renders for this progress
    try {
      const { data: orphanRenders } = await supabase
        .from('video_renders')
        .select('render_id')
        .eq('status', 'pending')
        .eq('user_id', userId)
        .filter('content_config->>progressId', 'eq', progressId);
      
      if (orphanRenders && orphanRenders.length > 0) {
        for (const r of orphanRenders) {
          await supabase.from('video_renders')
            .update({ status: 'failed', error_message: errorMessage, completed_at: new Date().toISOString() })
            .eq('render_id', r.render_id);
          console.log(`[auto-generate-universal-video] r43: Cleaned up orphan pending render ${r.render_id}`);
        }
      }
    } catch (cleanupErr) {
      console.warn('[auto-generate-universal-video] r43: Orphan cleanup failed (non-fatal):', cleanupErr);
    }
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
    
    // r42: ISOLATION LADDER — deterministic steps instead of generic retry
    // Step A (attempt 1): Current stability mode (full features)
    // Step B (attempt 2): Disable ALL risky subsystems
    // Step C (attempt 3): Strict minimal payload
    const isolationStep = retryAttempt <= 1 ? 'A' : retryAttempt === 2 ? 'B' : 'C';
    console.log(`[render-only] 🔬 r42 ISOLATION STEP: ${isolationStep} (attempt ${retryAttempt})`);
    
    // r32: Lottie fallback flags — applied to inputProps.diag
    let lottieFallbackFlags: Record<string, boolean> = {};
    // r33: Audio strip flag
    let audioStripped = false;
    
    if (isAudioCorruption) {
      // r33: AUDIO CORRUPTION → keep 30fps, strip all audio sources
      console.log(`[render-only] 🔊 r33 AUDIO CORRUPTION detected — keeping ${fps}fps, stripping audio sources`);
      audioStripped = true;
    } else if (isolationStep === 'C') {
      // r42: STEP C — maximum isolation: disable EVERYTHING risky + reduce fps
      console.log(`[render-only] 🔬 r42 STEP C: MAXIMUM ISOLATION — disabling all subsystems`);
      lottieFallbackFlags = {
        disableAllLottie: true,
        disableLottieIcons: true,
        disableMorphTransitions: true,
        disableCharacter: true,
        disablePrecisionSubtitles: true,
        disableSceneFx: true,
        disableAnimatedText: true,
      };
      // Also reduce fps for step C
      const targetFps = 15;
      if (fps > targetFps) {
        const durationSeconds = dif / fps;
        fps = targetFps;
        dif = Math.round(durationSeconds * fps);
        console.log(`[render-only] 📉 r42 STEP C FPS REDUCTION: ${originalFps}fps → ${fps}fps`);
      }
    } else if (isolationStep === 'B') {
      // r42: STEP B — disable all risky subsystems, keep fps
      console.log(`[render-only] 🔬 r42 STEP B: Disabling risky subsystems (Lottie, SceneFx, PrecisionSubtitles)`);
      lottieFallbackFlags = {
        disableAllLottie: true,
        disableLottieIcons: true,
        disableMorphTransitions: true,
        disableCharacter: true,
        disablePrecisionSubtitles: true,
        disableSceneFx: true,
      };
    } else if (sourceErrorCategory === 'lambda_crash' && isLottieStall) {
      // r35: LOTTIE STALL in step A → disable ALL Lottie immediately
      console.log(`[render-only] 🎭 r35 LOTTIE STALL detected — keeping ${fps}fps, disableAllLottie IMMEDIATELY`);
      lottieFallbackFlags = {
        disableAllLottie: true,
        disableLottieIcons: true,
        disableMorphTransitions: true,
        disableCharacter: true,
      };
    } else if (sourceErrorCategory === 'timeout') {
      // TIMEOUT: Reduce fps
      const FPS_CHAIN = [24, 20, 15];
      const targetFps = FPS_CHAIN[Math.min(retryAttempt - 1, FPS_CHAIN.length - 1)] || 15;
      if (fps > targetFps) {
        const durationSeconds = dif / fps;
        fps = targetFps;
        dif = Math.round(durationSeconds * fps);
        console.log(`[render-only] 📉 r28 TIMEOUT FPS REDUCTION: ${originalFps}fps → ${fps}fps, frames ${oldPayload.durationInFrames} → ${dif}`);
      }
    } else if (sourceErrorCategory === 'rate_limit') {
      console.log(`[render-only] 🔧 r28 RATE_LIMIT strategy: keeping fps=${fps}, reducing Lambdas via retryAttempt=${retryAttempt}`);
    } else if (sourceErrorCategory === 'lambda_crash') {
      // Non-Lottie lambda crash: defensive Lottie disable + fps reduction
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
        console.log(`[render-only] 📉 r32 lambda_crash FPS REDUCTION: ${originalFps}fps → ${fps}fps`);
      }
    } else {
      // Unknown: progressive fps reduction
      const FPS_CHAIN = [24, 20, 15];
      const targetFps = FPS_CHAIN[Math.min(retryAttempt - 1, FPS_CHAIN.length - 1)] || 15;
      if (fps > targetFps) {
        const durationSeconds = dif / fps;
        fps = targetFps;
        dif = Math.round(durationSeconds * fps);
        console.log(`[render-only] 📉 r28 FALLBACK FPS REDUCTION: ${originalFps}fps → ${fps}fps`);
      }
    }
    
    // r40: Force stability scheduling for ALL retryable error categories
    const retrySchedulingMode = determineSchedulingMode({ 
      lastErrorCategory: sourceErrorCategory, 
      forceStability: true, // r40: always force stability on retries
    });
    let scheduling = calculateScheduling(dif, { 
      retryAttempt,
      schedulingMode: retrySchedulingMode,
    });
    console.log(`[render-only] r42 retrySchedulingMode: ${retrySchedulingMode}, fpl=${scheduling.framesPerLambda}, lambdas=${scheduling.estimatedLambdas}, estRuntime=${scheduling.estRuntimeSec?.toFixed(1)}s, timeoutBudgetOk=${scheduling.timeoutBudgetOk}`);
    
    // r42: ENFORCE TIMEOUT BUDGET — if scheduling says needsFpsReduction, apply it NOW
    if (scheduling.needsFpsReduction && fps > 15) {
      const durationSeconds = dif / fps;
      const oldFps = fps;
      fps = 15; // Force minimum viable fps
      dif = Math.round(durationSeconds * fps);
      console.log(`[render-only] ⚠️ r42 TIMEOUT BUDGET ENFORCEMENT: ${oldFps}fps → ${fps}fps, frames → ${dif} (was going to exceed ${LAMBDA_TIMEOUT_SECONDS}s)`);
      // Recalculate scheduling with new frame count
      const newScheduling = calculateScheduling(dif, { retryAttempt, schedulingMode: retrySchedulingMode });
      scheduling.framesPerLambda = newScheduling.framesPerLambda;
      scheduling.estimatedLambdas = newScheduling.estimatedLambdas;
      scheduling.estRuntimeSec = newScheduling.estRuntimeSec;
      scheduling.timeoutBudgetOk = newScheduling.timeoutBudgetOk;
      console.log(`[render-only] 🔧 r42 Re-scheduled after budget enforcement: fpl=${scheduling.framesPerLambda}, lambdas=${scheduling.estimatedLambdas}, estRuntime=${scheduling.estRuntimeSec?.toFixed(1)}s`);
    }
    
    // Update payload with new fps and duration
    newPayload.durationInFrames = dif;
    newPayload.fps = fps;
    newPayload.frameRange = [0, dif - 1];
    
    // Also update inputProps if they contain fps/durationInFrames + r32: inject Lottie fallback flags + r41: silentRender
    if (newPayload.inputProps?.type === 'payload') {
      try {
        const props = JSON.parse(newPayload.inputProps.payload);
        if (props.fps) props.fps = fps;
        if (props.durationInFrames) props.durationInFrames = dif;
        
        // r41: Always set silentRender on retries (audio muxed after render)
        props.diag = { ...(props.diag || {}), silentRender: true };
        
        // r32: Merge Lottie fallback flags into diag
        if (Object.keys(lottieFallbackFlags).length > 0) {
          props.diag = { ...props.diag, ...lottieFallbackFlags, r32_lottieRecovery: true, r32_retryAttempt: retryAttempt };
          // Also update character settings if disableAllLottie is set
          if (lottieFallbackFlags.disableAllLottie || lottieFallbackFlags.disableCharacter) {
            props.useCharacter = false;
            props.characterType = 'svg';
          }
          console.log(`[render-only] 🎭 r32 injected Lottie fallback flags into inputProps.diag:`, JSON.stringify(lottieFallbackFlags));
        }
        
        // r33: Strip corrupt audio sources from inputProps (r41: always stripped since silentRender)
        if (audioStripped) {
          props.diag = { ...props.diag, r33_audioStripped: true, r33_retryAttempt: retryAttempt };
          console.log(`[render-only] 🔊 r33+r41 audio corruption flagged, silentRender handles audio skip`);
        }
        
        newPayload.inputProps = { type: 'payload', payload: JSON.stringify(props) };
      } catch (e) {
        console.warn('[render-only] Could not update inputProps fps (non-fatal)');
      }
    }
    
    // r41: Force muted + no audioCodec on retries too
    newPayload.muted = true;
    newPayload.audioCodec = null;
    
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
          // r41: Propagate silentRender + audioTracks for post-render muxing
          silentRender: true,
        },
      };
    }
    
    console.log(`[render-only] ✅ New render record created: ${newRenderId}, payload cloned with adaptive scheduling`);
    
    const statusLabel = audioStripped ? '🔊 Audio entfernt' : isolationStep !== 'A' ? `Isolation ${isolationStep}` : Object.keys(lottieFallbackFlags).length > 0 ? 'Lottie-Safe' : '';
    await updateProgress(supabase, newProgressId, 'ready_to_render', 88, `🚀 Render-Only Retry #${retryAttempt} bereit (${estimatedLambdas}λ, Step ${isolationStep}${statusLabel ? ', ' + statusLabel : ''})...`, {
      renderId: newRenderId,
      outName: newOutName,
      lambdaPayload: newPayload,
      progressId: newProgressId,
      renderOnly: true,
      retryAttempt,
      // r37: Persist chain source ID for deterministic retry counting
      sourceProgressId: chainSourceProgressId,
      // r42: Full forensics for isolation mode
      isolationStep,
      schedulingMode: retrySchedulingMode,
      framesPerLambda: scheduling.framesPerLambda,
      estimatedLambdas: scheduling.estimatedLambdas,
      estRuntimeSec: scheduling.estRuntimeSec,
      timeoutBudgetOk: scheduling.timeoutBudgetOk,
      fpsUsed: fps,
      effectiveFlags: {
        ...lottieFallbackFlags,
        silentRender: true,
        audioStripped,
        isLottieStall,
        isolationStep,
      },
      sourceErrorCategory,
      sourceErrorSignature: `${sourceErrorCategory}::${sourceErrorMessage.substring(0, 100)}`,
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
    
    // r43: Cleanup orphan pending renders for this render-only progress
    try {
      const { data: orphanRenders } = await supabase
        .from('video_renders')
        .select('render_id')
        .eq('status', 'pending')
        .eq('user_id', userId)
        .filter('content_config->>progressId', 'eq', newProgressId);
      
      if (orphanRenders && orphanRenders.length > 0) {
        for (const r of orphanRenders) {
          await supabase.from('video_renders')
            .update({ status: 'failed', error_message: errorMessage, completed_at: new Date().toISOString() })
            .eq('render_id', r.render_id);
          console.log(`[render-only] r43: Cleaned up orphan pending render ${r.render_id}`);
        }
      }
    } catch (cleanupErr) {
      console.warn('[render-only] r43: Orphan cleanup failed (non-fatal):', cleanupErr);
    }
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
    // r48: MERGE result_data instead of overwriting — preserves buildTag + normalization stats
    try {
      const { data: existing } = await supabase
        .from('universal_video_progress')
        .select('result_data')
        .eq('id', progressId)
        .maybeSingle();
      
      const existingData = (existing?.result_data && typeof existing.result_data === 'object') ? existing.result_data : {};
      updateData.result_data = { ...existingData, ...data, buildTag: AUTO_GEN_BUILD_TAG };
    } catch (mergeErr) {
      // Fallback: just write new data + buildTag
      console.warn('[updateProgress] r48 merge failed, writing new data only:', mergeErr);
      updateData.result_data = { ...data, buildTag: AUTO_GEN_BUILD_TAG };
    }
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

async function generateAIFallbackImage(
  title: string,
  sceneType: string,
  category: string,
  primaryColor?: string,
  secondaryColor?: string,
  visualStyle?: string,
  supabaseUrl?: string,
  supabaseServiceKey?: string
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY || !supabaseUrl || !supabaseServiceKey) {
    console.warn('[AI Fallback] Missing LOVABLE_API_KEY or Supabase config, using SVG fallback');
    return await generateSVGFallbackToStorage(title, primaryColor, secondaryColor, supabaseUrl, supabaseServiceKey);
  }

  const scenePromptMap: Record<string, string> = {
    'hook': 'dramatic wide establishing shot, bold abstract shapes converging to center, dynamic energy',
    'problem': 'abstract visualization of challenge or tension, fragmented geometric shapes, moody atmosphere',
    'solution': 'bright optimistic abstract composition, light rays breaking through, harmonious flowing shapes',
    'feature': 'clean product showcase environment, spotlight on central area, organized grid elements',
    'proof': 'data visualization aesthetic, abstract charts and graphs, trustworthy corporate feel',
    'cta': 'energetic motivational background, arrows and directional elements, call to action energy',
  };
  
  const sceneContext = scenePromptMap[sceneType] || 'professional abstract background, clean composition';
  const colors = primaryColor && secondaryColor 
    ? `dominant color palette: ${primaryColor} and ${secondaryColor}` 
    : primaryColor 
    ? `dominant color: ${primaryColor}` 
    : 'professional blue and purple tones';

  const prompt = `Create a 1920x1080 professional background illustration for a ${category} video scene about "${title}". ${sceneContext}. ${colors}. Style: ${visualStyle || 'modern'}, flat illustration with subtle gradients and geometric patterns. Absolutely NO text, NO letters, NO words, NO numbers, NO human faces, NO photography. Abstract, clean, visually striking. High contrast, vibrant.`;

  try {
    console.log(`[AI Fallback] Generating AI background for scene "${title}" (${sceneType})`);
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(`[AI Fallback] Gemini failed (${aiResponse.status}):`, errText);
      return await generateSVGFallbackToStorage(title, primaryColor, secondaryColor, supabaseUrl!, supabaseServiceKey!);
    }

    const aiData = await aiResponse.json();
    console.log('[AI Fallback] Gemini response keys:', JSON.stringify(Object.keys(aiData?.choices?.[0]?.message || {})));
    
    // Try multiple response formats for robustness
    let imageData: string | undefined;
    
    // Format 1: message.images array (documented Lovable AI Gateway format)
    imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    // Format 2: message.content array with image_url parts (OpenAI-compatible)
    if (!imageData) {
      const content = aiData.choices?.[0]?.message?.content;
      if (Array.isArray(content)) {
        const imagePart = content.find((part: any) => part.type === 'image_url');
        if (imagePart?.image_url?.url) {
          imageData = imagePart.image_url.url;
        }
      }
    }
    
    // Format 3: inline_data in parts (raw Gemini format)
    if (!imageData) {
      const parts = aiData.choices?.[0]?.message?.parts;
      if (Array.isArray(parts)) {
        const imgPart = parts.find((p: any) => p.inline_data);
        if (imgPart?.inline_data?.data) {
          const mime = imgPart.inline_data.mime_type || 'image/png';
          imageData = `data:${mime};base64,${imgPart.inline_data.data}`;
        }
      }
    }

    if (!imageData || !imageData.startsWith('data:image')) {
      console.warn('[AI Fallback] No image in Gemini response. Response structure:', JSON.stringify(aiData.choices?.[0]?.message || {}).slice(0, 500));
      return await generateSVGFallbackToStorage(title, primaryColor, secondaryColor, supabaseUrl!, supabaseServiceKey!);
    }

    // Upload base64 image to Supabase Storage
    const base64Content = imageData.split(',')[1];
    const imageBytes = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));
    const fileName = `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const storagePath = `ai-fallbacks/${fileName}`;

    const uploadClient = createClient(supabaseUrl, supabaseServiceKey);
    const { error: uploadError } = await uploadClient.storage
      .from('video-assets')
      .upload(storagePath, imageBytes, { contentType: 'image/png', upsert: true });

    if (uploadError) {
      console.error('[AI Fallback] Storage upload failed:', uploadError.message);
      return await generateSVGFallbackToStorage(title, primaryColor, secondaryColor, supabaseUrl!, supabaseServiceKey!);
    }

    const { data: publicUrlData } = uploadClient.storage
      .from('video-assets')
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData?.publicUrl;
    if (!publicUrl) {
      console.error('[AI Fallback] Failed to get public URL');
      return await generateSVGFallbackToStorage(title, primaryColor, secondaryColor, supabaseUrl!, supabaseServiceKey!);
    }

    console.log(`[AI Fallback] ✅ AI background generated and uploaded: ${publicUrl}`);
    return publicUrl;
  } catch (e) {
    console.error('[AI Fallback] Error generating AI fallback:', e);
    return await generateSVGFallbackToStorage(title, primaryColor, secondaryColor, supabaseUrl!, supabaseServiceKey!);
  }
}

async function generateSVGFallbackToStorage(
  title: string,
  primaryColor?: string,
  secondaryColor?: string,
  supabaseUrl?: string,
  supabaseServiceKey?: string
): Promise<string> {
  const pc = primaryColor || '#3b82f6';
  const sc = secondaryColor || '#1e293b';
  
  // Create a visually appealing SVG with gradient + geometric patterns
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${pc};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${sc};stop-opacity:1"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="60%">
      <stop offset="0%" style="stop-color:white;stop-opacity:0.15"/>
      <stop offset="100%" style="stop-color:white;stop-opacity:0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <rect width="1920" height="1080" fill="url(#glow)"/>
  <circle cx="300" cy="200" r="150" fill="white" opacity="0.06"/>
  <circle cx="1600" cy="800" r="200" fill="white" opacity="0.05"/>
  <circle cx="960" cy="540" r="300" fill="white" opacity="0.04"/>
  <rect x="100" y="600" width="400" height="400" rx="40" fill="white" opacity="0.03" transform="rotate(15 300 800)"/>
  <rect x="1400" y="100" width="350" height="350" rx="30" fill="white" opacity="0.04" transform="rotate(-20 1575 275)"/>
  <polygon points="960,200 1100,500 820,500" fill="white" opacity="0.05"/>
</svg>`;

  // Try uploading to Supabase Storage
  if (supabaseUrl && supabaseServiceKey) {
    try {
      const uploadClient = createClient(supabaseUrl, supabaseServiceKey);
      const fileName = `svg-fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.svg`;
      const storagePath = `ai-fallbacks/${fileName}`;
      
      const svgBytes = new TextEncoder().encode(svgContent);
      const { error: uploadError } = await uploadClient.storage
        .from('video-assets')
        .upload(storagePath, svgBytes, { contentType: 'image/svg+xml', upsert: true });

      if (!uploadError) {
        const { data: publicUrlData } = uploadClient.storage
          .from('video-assets')
          .getPublicUrl(storagePath);
        
        if (publicUrlData?.publicUrl) {
          console.log(`[SVG Fallback] ✅ Uploaded to storage: ${publicUrlData.publicUrl}`);
          return publicUrlData.publicUrl;
        }
      }
      console.error('[SVG Fallback] Upload failed:', uploadError?.message);
    } catch (e) {
      console.error('[SVG Fallback] Storage error:', e);
    }
  }
  
  // r46: NEVER return data-URI — it crashes Lambda. Throw so caller can force gradient.
  console.error('[SVG Fallback] Storage upload failed and data-URI is forbidden. Throwing error.');
  throw new Error('SVG fallback storage upload failed — data-URI forbidden for Lambda stability');
}

function generatePNGPlaceholder(title: string, primaryColor?: string, secondaryColor?: string): string {
  // DEPRECATED: placehold.co is blocked in Lambda. Use generateSVGFallbackToStorage instead.
  console.warn('[DEPRECATED] generatePNGPlaceholder called — placehold.co is unreliable in Lambda');
  const bgColor = (primaryColor || '#3b82f6').replace('#', '');
  const endColor = (secondaryColor || '#1e293b').replace('#', '');
  return `https://placehold.co/1920x1080/${bgColor}/${endColor}.png?text=+`;
}

async function generateSVGPlaceholder(title: string, color?: string): Promise<string> {
  return generatePNGPlaceholder(title, color);
}

function getDefaultTextPosition(sceneType: string): string {
  const map: Record<string, string> = {
    hook: 'center', intro: 'center', problem: 'bottom',
    solution: 'bottom', feature: 'bottom', proof: 'bottom',
    cta: 'center', outro: 'center', transition: 'center',
  };
  return map[sceneType] || 'bottom';
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

/** Phase 3: Smart truncation — keeps up to maxSentences complete sentences, max maxWords words */
/** r60-phase12: URL-safe — protects dots inside URLs from being treated as sentence boundaries */
function smartTruncateToSentences(text: string, maxSentences: number, maxWords: number): string {
  if (!text) return '';
  // Phase 12: Protect URLs from dot-based sentence splitting
  const URL_PLACEHOLDER = '\u2024'; // One-Dot-Leader as safe placeholder
  const urlSafe = text.replace(/(https?:\/\/[^\s]+|www\.[^\s]+)/g, match =>
    match.replace(/\./g, URL_PLACEHOLDER)
  );
  // Split into sentences
  const sentences = urlSafe.match(/[^.!?]+[.!?]+/g) || [urlSafe];
  let result = '';
  let wordCount = 0;
  for (let i = 0; i < Math.min(sentences.length, maxSentences); i++) {
    const sentenceWords = sentences[i].trim().split(/\s+/);
    if (wordCount + sentenceWords.length > maxWords && i > 0) break;
    result += (result ? ' ' : '') + sentences[i].trim();
    wordCount += sentenceWords.length;
  }
  // Fallback: if no sentence boundary found, truncate to maxWords cleanly (no ellipsis)
  if (!result) {
    const words = urlSafe.split(/\s+/);
    result = words.slice(0, maxWords).join(' ');
  }
  // Restore URL dots
  return result.replace(new RegExp(URL_PLACEHOLDER, 'g'), '.');
}

function getDefaultAnimation(sceneType: string): string {
  // r55: Premium Loft-Film animations (unlocked with r55 dimension fixes)
  const map: Record<string, string> = {
    hook: 'popIn', intro: 'fadeIn', problem: 'kenBurns',
    solution: 'flyIn', feature: 'parallax', proof: 'zoomIn',
    cta: 'popIn', outro: 'fadeIn', transition: 'fadeIn',
  };
  return map[sceneType] || 'fadeIn';
}

function getDefaultTransition(sceneType: string): string {
  // r55: Scene-type-based transitions for cinematic feel
  const map: Record<string, string> = {
    hook: 'crossfade', intro: 'fade', problem: 'crossfade',
    solution: 'slide', feature: 'fade', proof: 'wipe',
    cta: 'wipe', outro: 'fade', transition: 'fade',
  };
  return map[sceneType] || 'fade';
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
