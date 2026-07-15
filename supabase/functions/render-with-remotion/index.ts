import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { AwsClient } from "npm:aws4fetch@1.0.18";
import { normalizeStartPayload, payloadDiagnostics } from "../_shared/remotion-payload.ts";
import { getLambdaFunctionName, AWS_REGION, DEFAULT_BUCKET_NAME, REMOTION_BUNDLE_BUCKET_NAME } from "../_shared/aws-lambda.ts";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";
import { pickRenderTier, checkRenderAdmission } from "../_shared/render-concurrency.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-qa-mock',
};

// AWS Lambda configuration
const LAMBDA_FUNCTION_NAME = getLambdaFunctionName();

// Note: We ALWAYS serialize inputProps to S3 since Remotion's internal serialization fails

// ✅ CORRECT FIX: Post-process JSON string AFTER JSON.stringify to escape non-ASCII
// Using String.fromCharCode(92) produces exactly ONE backslash in the output
// This prevents double-escaping that happens when using a replacer function
function toAsciiSafeJson(jsonString: string): string {
  return jsonString.replace(/[\u0080-\uffff]/g, (char) => {
    const hex = char.charCodeAt(0).toString(16).padStart(4, '0');
    // String.fromCharCode(92) = single backslash, not escaped
    return String.fromCharCode(92) + 'u' + hex;
  });
}

function normalizeRemotionServeUrl(rawServeUrl: string): string {
  try {
    const url = new URL(rawServeUrl);
    const bucketMatch = url.hostname.match(/^(remotionlambda-eucentral1-[^.]+)\.s3[.-]/i);
    const secretBucketName = bucketMatch?.[1];

    if (secretBucketName && secretBucketName !== REMOTION_BUNDLE_BUCKET_NAME) {
      const normalized = new URL(rawServeUrl);
      normalized.hostname = `${REMOTION_BUNDLE_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com`;
      console.warn('⚠️ Outdated REMOTION_SERVE_URL bucket detected — normalizing to canonical bundle bucket', {
        secretBucketName,
        canonicalBundleBucket: REMOTION_BUNDLE_BUCKET_NAME,
        originalServeUrlPrefix: rawServeUrl.substring(0, 96),
        normalizedServeUrlPrefix: normalized.toString().substring(0, 96),
      });
      return normalized.toString();
    }
  } catch (error) {
    console.warn('⚠️ Could not parse REMOTION_SERVE_URL, using raw value', {
      error: error instanceof Error ? error.message : String(error),
      serveUrlPrefix: rawServeUrl.substring(0, 96),
    });
  }

  return rawServeUrl;
}

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

async function failRenderAndRefundOnce(params: {
  supabaseAdmin: any;
  pendingRenderId: string;
  userId: string;
  creditsRequired: number;
  message: string;
  category: string;
  extraConfig?: Record<string, unknown>;
}) {
  const { supabaseAdmin, pendingRenderId, userId, creditsRequired, message, category, extraConfig = {} } = params;
  const { data: current } = await supabaseAdmin
    .from('video_renders')
    .select('status, content_config')
    .eq('render_id', pendingRenderId)
    .maybeSingle();

  if (current?.status === 'completed') return;

  const existingConfig = (current?.content_config as any) || {};
  const alreadyRefunded = existingConfig.credit_refund_done === true;
  if (!alreadyRefunded && creditsRequired > 0) {
    const { error: refundError } = await supabaseAdmin.rpc('increment_balance', {
      p_user_id: userId,
      p_amount: creditsRequired,
    });
    if (refundError) console.error('💰 Refund failed:', refundError);
    else console.log(`💰 Refunded ${creditsRequired} credits for failed render ${pendingRenderId}`);
  }

  await supabaseAdmin
    .from('video_renders')
    .update({
      status: 'failed',
      error_message: message.slice(0, 1000),
      completed_at: new Date().toISOString(),
      content_config: {
        ...existingConfig,
        ...extraConfig,
        credit_refund_done: alreadyRefunded || creditsRequired > 0,
        error_category: category,
        failure_stage: 'lambda_start',
      },
    })
    .eq('render_id', pendingRenderId);
}

const THROTTLE_PATTERNS = [
  /rate exceeded/i,
  /toomanyrequests/i,
  /concurrencylimitexceeded/i,
  /aws concurrency limit/i,
  /throttl/i,
];

// Transient network/runtime failures from the AWS SDK call itself
// (connection abort, idle timeout) — should be retried like throttling.
const TRANSIENT_PATTERNS = [
  /operation was aborted/i,
  /\baborted\b/i,
  /\btimeout\b/i,
  /idle timeout/i,
  /network error/i,
  /fetch failed/i,
  /connection.*(reset|closed)/i,
];

function isThrottleSignal(status: number, body: string): boolean {
  if (status === 429) return true;
  if (status >= 500 && /rate|throttl|concurrency/i.test(body)) return true;
  return THROTTLE_PATTERNS.some((rx) => rx.test(body));
}

function isTransientSignal(message: string): boolean {
  return THROTTLE_PATTERNS.some((rx) => rx.test(message))
    || TRANSIENT_PATTERNS.some((rx) => rx.test(message));
}

function stabilizeUniversalCreatorScenes(customizations: Record<string, any>) {
  if (!Array.isArray(customizations.scenes)) {
    return { customizations, stabilizedVideoCount: 0 };
  }

  let stabilizedVideoCount = 0;
  const stableScenes = customizations.scenes.map((scene: any) => {
    const background = scene?.background || {};
    const hasExternalBackgroundVideo = background?.type === 'video' && typeof background?.videoUrl === 'string' && /^https?:\/\//i.test(background.videoUrl);
    const hasExternalAnimatedVideo = scene?.useAnimation === true && typeof scene?.animatedVideoUrl === 'string' && /^https?:\/\//i.test(scene.animatedVideoUrl);

    if (!hasExternalBackgroundVideo && !hasExternalAnimatedVideo) return scene;

    stabilizedVideoCount += Number(hasExternalBackgroundVideo) + Number(hasExternalAnimatedVideo);
    const fallbackBackground = background?.imageUrl
      ? { type: 'image', imageUrl: background.imageUrl }
      : {
          type: 'gradient',
          gradientColors: Array.isArray(background?.gradientColors) && background.gradientColors.length >= 2
            ? background.gradientColors
            : ['#050816', '#111827'],
        };

    return {
      ...scene,
      useAnimation: false,
      animatedVideoUrl: undefined,
      background: hasExternalBackgroundVideo ? fallbackBackground : background,
      renderStabilized: true,
    };
  });

  return {
    customizations: {
      ...customizations,
      scenes: stableScenes,
      renderStabilization: {
        enabled: stabilizedVideoCount > 0,
        strategy: 'external-video-to-static-fallback',
        stabilizedVideoCount,
      },
    },
    stabilizedVideoCount,
  };
}

async function startRemotionRender(params: {
  aws: any;
  lambdaUrl: string;
  asciiSafeJson: string;
  pendingRenderId: string;
  userId: string;
  creditsRequired: number;
  supabaseAdmin: any;
  bucketName: string;
  outName: string;
}): Promise<{ ok: true; realRenderId: string; lambdaRequestId: string | null } | { ok: false; error: string; errorCategory: string; status: number }> {
  const { aws, lambdaUrl, asciiSafeJson, pendingRenderId, userId, creditsRequired, supabaseAdmin, bucketName, outName } = params;

  // Shorter backoff schedule so we stay well under the Edge Function budget (~150s).
  // Worst case 2+5+10 = 17s on top of the actual call latency.
  const BACKOFFS_MS = [2000, 5000, 10000];
  const MAX_ATTEMPTS = BACKOFFS_MS.length + 1; // 4 total attempts

  let lastError: { status: number; body: string } | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const lambdaResponse = await aws.fetch(lambdaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: asciiSafeJson,
      });
      const lambdaRequestId = lambdaResponse.headers.get('x-amzn-requestid') || null;
      const responseText = await lambdaResponse.text().catch(() => '');
      console.log(`📥 Lambda start response (attempt ${attempt}/${MAX_ATTEMPTS}):`, lambdaResponse.status, 'requestId:', lambdaRequestId, 'body:', responseText.substring(0, 500));

      if (!lambdaResponse.ok) {
        const throttled = isThrottleSignal(lambdaResponse.status, responseText);
        if (throttled && attempt < MAX_ATTEMPTS) {
          const wait = BACKOFFS_MS[attempt - 1];
          console.warn(`⏳ Lambda throttled (${lambdaResponse.status}). Retry ${attempt + 1}/${MAX_ATTEMPTS} in ${wait}ms`);
          await supabaseAdmin
            .from('video_renders')
            .update({ error_message: `Warte auf AWS-Kapazität (Versuch ${attempt + 1}/${MAX_ATTEMPTS})…` })
            .eq('render_id', pendingRenderId);
          lastError = { status: lambdaResponse.status, body: responseText };
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        const category = lambdaResponse.status === 429 || throttled ? 'rate_limit' : 'lambda_start_failed';
        const message = throttled
          ? 'AWS-Kapazität gerade ausgelastet. Bitte in einer Minute erneut starten.'
          : `Lambda-Start fehlgeschlagen (${lambdaResponse.status}): ${responseText || 'Keine Antwort'}`;
        await failRenderAndRefundOnce({
          supabaseAdmin, pendingRenderId, userId, creditsRequired,
          message, category,
          extraConfig: { lambda_request_id: lambdaRequestId, lambda_error: responseText.substring(0, 1000), tracking_mode: 'request_response_sync', retry_attempts: attempt },
        });
        return { ok: false, error: message, errorCategory: category, status: lambdaResponse.status };
      }

      let parsed: any = null;
      try { parsed = responseText ? JSON.parse(responseText) : null; } catch { parsed = null; }
      const realRenderId = parsed?.renderId || null;
      if (!realRenderId) {
        const message = `Lambda-Start lieferte keine Render-ID zurück: ${responseText.substring(0, 500) || 'Leere Antwort'}`;
        await failRenderAndRefundOnce({
          supabaseAdmin, pendingRenderId, userId, creditsRequired,
          message, category: 'lambda_start_failed',
          extraConfig: { lambda_request_id: lambdaRequestId, lambda_error: responseText.substring(0, 1000), tracking_mode: 'request_response_sync_no_render_id' },
        });
        return { ok: false, error: message, errorCategory: 'lambda_start_failed', status: 502 };
      }

      const { data: current } = await supabaseAdmin
        .from('video_renders')
        .select('status, content_config')
        .eq('render_id', pendingRenderId)
        .maybeSingle();
      if (current?.status !== 'completed') {
        const existingConfig = (current?.content_config as any) || {};
        await supabaseAdmin
          .from('video_renders')
          .update({
            status: 'rendering',
            bucket_name: bucketName,
            error_message: null,
            content_config: {
              ...existingConfig,
              real_remotion_render_id: realRenderId,
              lambda_render_id: pendingRenderId,
              lambda_request_id: lambdaRequestId,
              lambda_function: LAMBDA_FUNCTION_NAME,
              lambda_accepted: true,
              lambda_start_status: 'accepted',
              tracking_mode: 'request_response_sync',
              bucket_name: bucketName,
              out_name: outName,
              retry_attempts: attempt,
            },
          })
          .eq('render_id', pendingRenderId);
      }
      console.log(`✅ Stored real Remotion render ID ${realRenderId} for ${pendingRenderId} (attempt ${attempt})`);
      return { ok: true, realRenderId, lambdaRequestId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Lambda start error';
      const transient = isTransientSignal(message);
      const throttled = THROTTLE_PATTERNS.some((rx) => rx.test(message));
      console.error(`❌ Lambda start failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, error);
      if (transient && attempt < MAX_ATTEMPTS) {
        const wait = BACKOFFS_MS[attempt - 1];
        await supabaseAdmin
          .from('video_renders')
          .update({ error_message: `Verbindung zu AWS unterbrochen, neuer Versuch ${attempt + 1}/${MAX_ATTEMPTS}…` })
          .eq('render_id', pendingRenderId);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      const category = /timeout|aborted|idle/i.test(message)
        ? 'timeout'
        : (throttled ? 'rate_limit' : 'lambda_start_failed');
      const friendly = throttled
        ? 'AWS-Kapazität gerade ausgelastet. Bitte in einer Minute erneut starten.'
        : category === 'timeout'
          ? 'AWS hat den Render-Start abgebrochen (Netzwerk-Timeout). Bitte erneut starten.'
          : `Lambda-Start Ausnahme: ${message}`;
      await failRenderAndRefundOnce({
        supabaseAdmin, pendingRenderId, userId, creditsRequired,
        message: friendly, category,
        extraConfig: { lambda_error: message.substring(0, 1000), tracking_mode: 'request_response_sync_exception', retry_attempts: attempt },
      });
      return { ok: false, error: friendly, errorCategory: category, status: 502 };
    }
  }

  const message = `AWS-Kapazität dauerhaft erschöpft nach ${MAX_ATTEMPTS} Versuchen. Bitte später erneut versuchen.`;
  if (lastError) {
    await failRenderAndRefundOnce({
      supabaseAdmin, pendingRenderId, userId, creditsRequired,
      message, category: 'rate_limit',
      extraConfig: { lambda_error: lastError.body.substring(0, 1000), tracking_mode: 'request_response_sync', retry_attempts: MAX_ATTEMPTS },
    });
  }
  return { ok: false, error: message, errorCategory: 'rate_limit', status: 429 };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "render-with-remotion" });


  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  
  let userId: string | null = null;
  let credits_required = 0;

  // Initialize AWS client
  const aws = new AwsClient({
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    region: AWS_REGION,
  });

  try {
    const body = await req.json();
    const { project_id, component_name, customizations, format = 'mp4', aspect_ratio = '9:16', quality = 'hd', userId: bodyUserId } = body;
    
    // Determine authentication method
    const authHeader = req.headers.get('Authorization') || '';
    const isServiceCall = authHeader.includes(supabaseServiceKey);
    
    if (isServiceCall && bodyUserId) {
      userId = bodyUserId;
      console.log('🔐 Service Role authentication - userId from body:', userId);
    } else {
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) {
        console.error('Auth error:', authError);
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      userId = user.id;
      console.log('🔐 User JWT authentication - userId:', userId);
    }

    // Calculate dimensions based on aspect ratio and quality
    const calculateDimensions = (aspectRatio: string, videoQuality: string) => {
      const hdMap: Record<string, { width: number; height: number }> = {
        '9:16': { width: 1080, height: 1920 },
        '16:9': { width: 1920, height: 1080 },
        '1:1': { width: 1080, height: 1080 },
        '4:5': { width: 1080, height: 1350 },
        '4:3': { width: 1440, height: 1080 },
      };
      
      const fourKMap: Record<string, { width: number; height: number }> = {
        '9:16': { width: 2160, height: 3840 },
        '16:9': { width: 3840, height: 2160 },
        '1:1': { width: 2160, height: 2160 },
        '4:5': { width: 2160, height: 2700 },
        '4:3': { width: 2880, height: 2160 },
      };
      
      const map = videoQuality === '4k' ? fourKMap : hdMap;
      return map[aspectRatio] || { width: 1080, height: 1920 };
    };

    const dimensions = calculateDimensions(aspect_ratio, quality);
    console.log(`🎬 Video quality: ${quality}, dimensions: ${dimensions.width}x${dimensions.height}`);

    // Calculate duration based on voiceover duration
    const requestedVoiceoverDuration = Number(customizations?.voiceoverDuration) || 30;

    // Maximum video duration: 10 minutes
    const MAX_VIDEO_DURATION = 600;
    if (requestedVoiceoverDuration > MAX_VIDEO_DURATION) {
      return new Response(JSON.stringify({ 
        error: `Video zu lang. Maximum ist ${MAX_VIDEO_DURATION} Sekunden (10 Minuten).`,
        requested: requestedVoiceoverDuration,
        maximum: MAX_VIDEO_DURATION
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Credit calculation based on video duration and quality
    const calculateCredits = (durationSeconds: number, videoQuality: string): number => {
      const qualityMultiplier = videoQuality === '4k' ? 2 : 1;
      
      let baseCost: number;
      if (durationSeconds < 30) {
        baseCost = 10;
      } else if (durationSeconds <= 60) {
        baseCost = 20;
      } else if (durationSeconds <= 180) {
        baseCost = 50;
      } else if (durationSeconds <= 300) {
        baseCost = 100;
      } else {
        baseCost = 200;
      }
      
      return baseCost * qualityMultiplier;
    };

    // Fetch project (project_id may be optional for Universal Video Creator)
    if (project_id) {
      const { data: projectData, error: projectError } = await supabaseAdmin
        .from('content_projects')
        .select('*')
        .eq('id', project_id)
        .eq('user_id', userId)
        .single();

      if (projectError || !projectData) {
        return new Response(JSON.stringify({ error: 'Project not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Calculate credits based on video duration and quality
    credits_required = calculateCredits(requestedVoiceoverDuration, quality);
    console.log(`💰 Credits für ${requestedVoiceoverDuration}s ${quality.toUpperCase()} Video: ${credits_required}`);

    // Lambda slot admission — safety net against AWS quota saturation.
    // Founders reserve band kicks in at 50/60 slots.
    try {
      const fps = 30;
      const estFrames = Math.max(30, Math.round(requestedVoiceoverDuration * fps));
      const tier = pickRenderTier(estFrames);
      const { data: isFounder } = await supabaseAdmin.rpc('is_active_founder', { _user_id: userId });
      const admission = await checkRenderAdmission({
        supabaseAdmin,
        isFounder: !!isFounder,
        tierMaxWorkers: tier.maxWorkers,
      });
      if (!admission.admitted) {
        console.warn(`[render-with-remotion] admission denied: ${admission.reason} used=${admission.usedWorkers}/${admission.slotBudget} need=${admission.neededWorkers} founder=${!!isFounder}`);
        return new Response(JSON.stringify({
          error: 'RENDER_SLOT_BUSY',
          reason: admission.reason,
          used_workers: admission.usedWorkers,
          slot_budget: admission.slotBudget,
          retry_after_seconds: admission.retryAfterSeconds,
          founders_only: admission.reason === 'founder_reserve',
        }), {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(admission.retryAfterSeconds),
          },
        });
      }
    } catch (admissionErr) {
      // Fail-open on unexpected error, but log.
      console.error('[render-with-remotion] admission check threw, admitting:', admissionErr);
    }


    // Check credits
    const { data: wallet } = await supabaseAdmin
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

    // Deduct credits
    await supabaseAdmin.rpc('deduct_credits', {
      p_user_id: userId,
      p_amount: credits_required
    });

    // NOTE: We intentionally do NOT overwrite content_projects.status here.
    // The 'status' column is the wizard/user lifecycle ('draft' | 'archived')
    // and is used by Universal Creator's auto-resume logic. Render lifecycle
    // lives fully in the video_renders table (observed via realtime).
    // Overwriting status='rendering' here previously caused the wizard to
    // "reset" to Step 2 because auto-resume filters on status='draft'.
    if (project_id) {
      await supabaseAdmin
        .from('content_projects')
        .update({ render_engine: 'remotion' })
        .eq('id', project_id);
    }

    console.log('🚀 Starting Remotion render:', {
      component_name,
      dimensions,
    });

    // Get configuration
    const rawRemotionServeUrl = Deno.env.get('REMOTION_SERVE_URL');

    if (!rawRemotionServeUrl) {
      throw new Error('REMOTION_SERVE_URL not configured');
    }

    const REMOTION_SERVE_URL = normalizeRemotionServeUrl(rawRemotionServeUrl);
    console.log('🔗 Effective REMOTION_SERVE_URL:', REMOTION_SERVE_URL.substring(0, 120));

    const componentName = component_name || 'UniversalVideo';

    // ✅ CRITICAL: Validate and sanitize scenes before sending to Lambda
    let sanitizedCustomizations = { ...(customizations || {}) };
    let stabilizedVideoCount = 0;
    
    if (Array.isArray(sanitizedCustomizations.scenes)) {
      const originalCount = sanitizedCustomizations.scenes.length;
      
      // 📊 EXTENDED DEBUG LOGGING - Log raw scene data before filtering
      console.log('📊 RAW SCENE DATA DEBUG:', JSON.stringify({
        sceneCount: originalCount,
        scenes: sanitizedCustomizations.scenes.map((s: any, i: number) => ({
          index: i,
          id: s?.id,
          type: s?.type,
          duration: s?.duration,
          durationType: typeof s?.duration,
          durationIsFinite: Number.isFinite(Number(s?.duration)),
          durationParsed: Number(s?.duration),
          durationValid: Number.isFinite(Number(s?.duration)) && Number(s?.duration) > 0,
          mediaType: s?.background?.type,
          hasVideoUrl: !!s?.background?.videoUrl,
          hasImageUrl: !!s?.background?.imageUrl,
          animatedVideoUrl: s?.animatedVideoUrl,
        }))
      }, null, 2));
      
      sanitizedCustomizations.scenes = sanitizedCustomizations.scenes
        .filter((s: any) => {
          const dur = Number(s?.duration);
          const isValid = Number.isFinite(dur) && dur > 0;
          if (!isValid) {
            console.warn(`⚠️ INVALID SCENE FILTERED: index=${sanitizedCustomizations.scenes.indexOf(s)}, id=${s?.id}, duration=${s?.duration}, parsed=${dur}`);
          }
          return isValid;
        })
        .map((s: any, index: number) => {
          // ✅ CRITICAL: Ensure duration is a valid positive number with minimum 0.5s
          const rawDuration = Number(s.duration);
          const safeDuration = Math.max(0.5, Math.min(600, Number.isFinite(rawDuration) ? rawDuration : 3));
          
          const sanitizedScene = {
            ...s,
            duration: safeDuration,
            // ✅ Ensure startTime and endTime are also valid if present
            startTime: Number.isFinite(Number(s.startTime)) ? Number(s.startTime) : undefined,
            endTime: Number.isFinite(Number(s.endTime)) ? Number(s.endTime) : undefined,
          };
          
          return sanitizedScene;
        });
      
      console.log(`🎬 Scene validation: ${originalCount} -> ${sanitizedCustomizations.scenes.length} valid scenes`);
      
      // 📊 Log sanitized scene summary
      console.log('📊 SANITIZED SCENE SUMMARY:', JSON.stringify({
        validCount: sanitizedCustomizations.scenes.length,
        totalDurationSeconds: sanitizedCustomizations.scenes.reduce((sum: number, s: any) => sum + s.duration, 0),
        scenes: sanitizedCustomizations.scenes.map((s: any, i: number) => ({
          index: i,
          id: s.id,
          duration: s.duration,
          type: s.type,
        }))
      }, null, 2));
      
      // Log any invalid scenes for debugging
      if (sanitizedCustomizations.scenes.length < originalCount) {
        console.warn(`⚠️ Filtered out ${originalCount - sanitizedCustomizations.scenes.length} invalid scenes`);
      }
      
      // ✅ CRITICAL: Ensure at least one scene exists
      if (sanitizedCustomizations.scenes.length === 0) {
        console.error('❌ NO VALID SCENES after filtering! Adding fallback scene.');
        sanitizedCustomizations.scenes = [{
          id: 'fallback-scene',
          order: 0,
          type: 'hook',
          duration: 5,
          background: { type: 'color', color: '#1a1a2e' },
          animation: 'fadeIn',
          transition: { type: 'fade', duration: 0.5 },
        }];
      }
    }

    if (componentName === 'UniversalCreatorVideo') {
      // Stabilization (replace external scene videos with image/gradient fallbacks)
      // is OFF by default — it was the root cause of black-image renders with
      // working audio. Re-enable per render by setting payload flag
      // `forceStableRenderPath: true` or env REMOTION_FORCE_STABLE_RENDER=1.
      const forceStable =
        (sanitizedCustomizations as any)?.forceStableRenderPath === true ||
        Deno.env.get('REMOTION_FORCE_STABLE_RENDER') === '1';
      if (forceStable) {
        const stabilized = stabilizeUniversalCreatorScenes(sanitizedCustomizations);
        sanitizedCustomizations = stabilized.customizations;
        stabilizedVideoCount = stabilized.stabilizedVideoCount;
        if (stabilizedVideoCount > 0) {
          console.log(`⚠️ Forced stable render path active — replaced ${stabilizedVideoCount} external video source(s) with static fallbacks`);
        }
      } else {
        console.log('✅ Passing external scene video URLs through to Lambda (stabilization disabled by default)');
      }
    }

    // ✅ CRITICAL FIX: Calculate durationInFrames EXPLICITLY to prevent Lambda array allocation errors
    const fps = 30;
    const sceneDurationSum = Array.isArray(sanitizedCustomizations.scenes) 
      ? sanitizedCustomizations.scenes.reduce((sum: number, s: any) => sum + Number(s.duration || 0), 0)
      : 0;
    const sanitizedVoiceoverDuration = Number(sanitizedCustomizations.voiceoverDuration) || 0;
    const totalDurationSeconds = Math.max(sceneDurationSum, sanitizedVoiceoverDuration, 5);
    
    // Ensure durationInFrames is a safe, finite positive integer
    const rawFrames = Math.ceil(totalDurationSeconds * fps);
    const durationInFrames = Math.max(30, Math.min(36000, Number.isFinite(rawFrames) ? rawFrames : 900));
    
    console.log('🔢 EXPLICIT DURATION CALCULATION:', {
      totalDurationSeconds,
      rawFrames,
      durationInFrames,
      fps,
      width: dimensions.width,
      height: dimensions.height,
    });

    // Build input props from sanitized customizations WITH explicit metadata
    const inputProps = {
      ...sanitizedCustomizations,
      template: component_name,
      aspectRatio: aspect_ratio,
      targetWidth: dimensions.width,
      targetHeight: dimensions.height,
      fps: fps,
      durationInFrames: durationInFrames, // ✅ EXPLICIT - prevents Lambda from calculating
    };

    const bucketName = DEFAULT_BUCKET_NAME;

    // ============================================
    // ✅ USE CORRECT REMOTION INPUTPROPS FORMAT
    // Based on Remotion source code research: inputProps must be
    // { type: "payload", payload: "<JSON-stringified-props>" }
    // NOT { type: "bucket-url", hash: "..." }
    // ============================================
    
    const inputPropsJson = JSON.stringify(inputProps);
    const inputPropsSize = new TextEncoder().encode(inputPropsJson).length;
    console.log(`📊 inputProps size: ${(inputPropsSize / 1024).toFixed(2)} KB`);

    // ✅ CORRECT FORMAT: Embed serialized props directly in payload
    // Remotion Lambda expects this exact structure
    const inputPropsForLambda = {
      type: 'payload',
      payload: inputPropsJson,
    };
    
    console.log('✅ inputProps prepared in payload format');

    // ============================================
    // ✅ ASYNC INVOCATION PATTERN
    // Generate pendingRenderId BEFORE Lambda call
    // Lambda is invoked async (Event mode) to avoid 504 timeout
    // Webhook receives result and updates DB
    // ============================================
    
    const pendingRenderId = `pending-${crypto.randomUUID()}`;
    const outName = `${pendingRenderId}.mp4`;
    const lambdaInvokedAt = new Date().toISOString();
    const webhookUrl = appendWebhookToken(`${supabaseUrl}/functions/v1/remotion-webhook`);
    
    console.log('🆔 Generated pendingRenderId:', pendingRenderId);
    console.log('🔔 Webhook URL:', webhookUrl);

    // Build and normalize Remotion Lambda payload with all required v4.0.424 fields
    const lambdaPayload = normalizeStartPayload({
      type: 'start',
      serveUrl: REMOTION_SERVE_URL,
      composition: componentName,
      inputProps: inputPropsForLambda,
      
      // Video metadata
      durationInFrames: durationInFrames,
      fps: fps,
      width: dimensions.width,
      height: dimensions.height,
      
      // Codec and format
      codec: format === 'mp4' ? 'h264' : 'gif',
      imageFormat: 'jpeg',
      jpegQuality: 80,
      
      // r61: Enable audio rendering for voiceover/music
      muted: false,
      audioCodec: 'aac',

      // r71: Scene-aware scheduling.
      // External MP4 backgrounds (Pixabay etc.) need many small parallel chunks
      // otherwise the 600s Lambda timeout is hit while one worker streams 4 remote
      // videos. We detect external videos and switch to distributed mode with an
      // explicit small framesPerLambda. Static (image/gradient/color) renders keep
      // the conservative stability path.
      ...(() => {
        // Beta-Launch Concurrency Policy (Lambda quota=100, 60-slot render pool):
        //   tiered maxWorkers 3/5/8/12 by frame count, minimum framesPerLambda=120.
        // External MP4 backgrounds (Pixabay etc.) still need distributed mode; when
        // present we bump the tier by one to keep 600s Lambda timeout safe.
        const scenes = Array.isArray((sanitizedCustomizations as any)?.scenes)
          ? (sanitizedCustomizations as any).scenes
          : [];
        const externalVideoCount = scenes.reduce((n: number, s: any) => {
          const bg = s?.background;
          const isExt = bg?.type === 'video' && typeof bg?.videoUrl === 'string' && /^https?:\/\//i.test(bg.videoUrl);
          const isAnim = s?.useAnimation === true && typeof s?.animatedVideoUrl === 'string' && /^https?:\/\//i.test(s.animatedVideoUrl);
          return n + (isExt ? 1 : 0) + (isAnim ? 1 : 0);
        }, 0);

        const tier = pickRenderTier(durationInFrames);
        const hasExternalVideos = externalVideoCount > 0;

        if (hasExternalVideos) {
          // Distributed mode: recompute framesPerLambda from tier target for
          // small parallel chunks. Cap workers to tier.maxWorkers.
          const fpl = Math.max(120, Math.min(200, Math.ceil(durationInFrames / tier.maxWorkers)));
          console.log(`🎞️ External video scenes (${externalVideoCount}) — tier=${tier.label}, maxWorkers=${tier.maxWorkers}, framesPerLambda=${fpl}`);
          return {
            _schedulingMode: 'distributed' as const,
            framesPerLambda: fpl,
            timeoutInMilliseconds: 600000,
          };
        }
        console.log(`🖼️ Static render — tier=${tier.label}, maxWorkers=${tier.maxWorkers}, framesPerLambda=${tier.framesPerLambda}`);
        return {
          _schedulingMode: 'tiered' as const,
          framesPerLambda: tier.framesPerLambda,
          timeoutInMilliseconds: 600000,
        };
      })(),

      // Output
      bucketName,
      outName,
      privacy: 'public',
      
      // Webhook
      webhook: {
        url: webhookUrl,
        secret: Deno.env.get('REMOTION_WEBHOOK_SECRET') ?? '',
        customData: {
          pending_render_id: pendingRenderId,
          user_id: userId,
          project_id: project_id,
          credits_used: credits_required,
          out_name: outName,
          stable_render_path: stabilizedVideoCount > 0,
          stabilized_video_sources: stabilizedVideoCount,
          // Allow callers (e.g. render-long-form-video) to override the source
          // so the webhook can route the result back to the right table.
          source: (customizations as any)?.source || 'universal-creator',
          sora_long_form_project_id: (customizations as any)?.sora_long_form_project_id || null,
        },
      },
    });

    console.log('🔧 Normalized payload diagnostics:', JSON.stringify(payloadDiagnostics(lambdaPayload)));

    console.log('📤 Lambda payload (async mode):', JSON.stringify({
      ...lambdaPayload,
      inputProps: `(payload format, ${(inputPropsSize / 1024).toFixed(2)} KB)`,
    }, null, 2));

    // ✅ INSERT RENDER RECORD FIRST (before Lambda call)
    // This allows polling to work immediately
    const { error: insertError } = await supabaseAdmin
      .from('video_renders')
      .insert({
        render_id: pendingRenderId,
        project_id,
        bucket_name: bucketName,
        format_config: { 
          format, 
          aspect_ratio,
          quality
        },
        content_config: {
          ...customizations,
          credits_used: credits_required,
          credit_refund_done: false,
          lambda_invoked_at: lambdaInvokedAt,
          lambda_start_requested: true,
          lambda_start_status: 'scheduled',
          tracking_mode: 'async-event-with-outname',
          bucket_name: bucketName,
          out_name: outName,
          stable_render_path: stabilizedVideoCount > 0,
          stabilized_video_sources: stabilizedVideoCount,
        },
        subtitle_config: {},
        status: 'rendering',
        started_at: new Date().toISOString(),
        user_id: userId
      });

    if (insertError) {
      console.error('Failed to create video_renders entry:', insertError);
      throw new Error(`Failed to create render record: ${insertError.message}`);
    }

    console.log('✅ Created render record with pendingRenderId:', pendingRenderId);

    const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;

    console.log('🚀 Scheduling Remotion Lambda start asynchronously (EdgeRuntime.waitUntil)...');

    const rawJson = JSON.stringify(lambdaPayload);
    const asciiSafeJson = toAsciiSafeJson(rawJson);

    console.log('📦 ASCII-safe JSON payload (post-processed), size:', asciiSafeJson.length, 'bytes');
    console.log('📝 Sample (first 500 chars):', asciiSafeJson.substring(0, 500));

    // Fire-and-forget: Lambda start (incl. retries on AWS aborts/throttles) runs
    // in the background so the edge function returns within ~1s and never hits
    // the 150s Supabase idle timeout. Webhook + polling reconcile the final state.
    EdgeRuntime.waitUntil(
      startRemotionRender({
        aws,
        lambdaUrl,
        asciiSafeJson,
        pendingRenderId,
        userId: userId!,
        creditsRequired: credits_required,
        supabaseAdmin,
        bucketName,
        outName,
      }).catch((err) => {
        console.error('❌ Background Lambda start crashed:', err);
        return failRenderAndRefundOnce({
          supabaseAdmin,
          pendingRenderId,
          userId: userId!,
          creditsRequired: credits_required,
          message: err instanceof Error ? `Lambda-Start Ausnahme: ${err.message}` : 'Lambda-Start Ausnahme: Unbekannter Fehler',
          category: 'lambda_start_failed',
          extraConfig: { lambda_start_status: 'failed', tracking_mode: 'async-event-start_exception' },
        });
      })
    );

    return new Response(
      JSON.stringify({
        ok: true,
        render_id: pendingRenderId,
        status: 'rendering',
        message: 'Video-Rendering wurde gestartet. Status wird automatisch aktualisiert.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );


  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Try to refund credits if we have userId and credits_required
    if (userId && credits_required > 0) {
      try {
        await supabaseAdmin.rpc('increment_balance', {
          p_user_id: userId,
          p_amount: credits_required
        });
        console.log(`💰 Refunded ${credits_required} credits due to error`);
      } catch (refundError) {
        console.error('Failed to refund credits:', refundError);
      }
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
