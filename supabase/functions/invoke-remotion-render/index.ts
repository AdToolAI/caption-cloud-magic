import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";
import { normalizeStartPayload, payloadDiagnostics, type NormalizedStartPayload } from "../_shared/remotion-payload.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AWS_REGION = 'eu-central-1';

// Read Lambda function name from env (Secret) — no more hardcoded version!
function getLambdaFunctionName(): string {
  // REMOTION_LAMBDA_FUNCTION_ARN may be a full ARN or just the function name
  const arn = Deno.env.get('REMOTION_LAMBDA_FUNCTION_ARN') || '';
  if (arn.includes(':function:')) {
    // Extract function name from ARN: arn:aws:lambda:region:account:function:NAME
    return arn.split(':function:')[1] || arn;
  }
  return arn || 'remotion-render-4-0-424-mem2048mb-disk2048mb-120sec';
}

// RequestResponse payload limit is 6 MB, Event is 256 KB
const MAX_EVENT_PAYLOAD_BYTES = 256 * 1024;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lambdaPayload, pendingRenderId, userId, progressId } = await req.json();

    if (!lambdaPayload || !pendingRenderId || !userId) {
      return new Response(
        JSON.stringify({ error: 'lambdaPayload, pendingRenderId, and userId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LAMBDA_FUNCTION_NAME = getLambdaFunctionName();
    const serveUrl = lambdaPayload.serveUrl || Deno.env.get('REMOTION_SERVE_URL') || '';

    // ✅ VERSION GUARD: Warn on Lambda/ServeURL version mismatch (non-blocking)
    const lambdaVersionMatch = LAMBDA_FUNCTION_NAME.match(/remotion-render-(\d+-\d+-\d+)/);
    // Only match explicit version patterns in the site path, not random digits in hostnames
    const serveUrlVersionMatch = serveUrl.match(/\/sites\/.*?(\d+-\d+-\d+)/) || serveUrl.match(/\/v(\d{3,})\b/);
    if (lambdaVersionMatch && serveUrlVersionMatch) {
      const lambdaVersion = lambdaVersionMatch[1].replace(/-/g, '.');
      const serveUrlVersion = serveUrlVersionMatch[1].replace(/-/g, '.');
      if (lambdaVersion !== serveUrlVersion && !serveUrl.includes(lambdaVersion.replace(/\./g, ''))) {
        console.warn(`⚠️ VERSION WARN: Lambda=${lambdaVersion}, ServeURL version=${serveUrlVersion}. Proceeding anyway.`);
      }
    } else if (lambdaVersionMatch && !serveUrlVersionMatch) {
      console.log(`ℹ️ VERSION GUARD: No version string found in ServeURL, skipping check. URL: ${serveUrl.substring(0, 80)}`);
    }

    console.log(`🚀 invoke-remotion-render: renderId=${pendingRenderId}, userId=${userId}`);
    console.log(`🔧 Lambda function: ${LAMBDA_FUNCTION_NAME}`);
    console.log(`🔧 ServeURL: ${serveUrl.substring(0, 80)}...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ✅ IDEMPOTENCY CHECK
    const { data: existingRender } = await supabase
      .from('video_renders')
      .select('status, content_config')
      .eq('render_id', pendingRenderId)
      .maybeSingle();

    if (existingRender?.content_config && (existingRender.content_config as any).real_remotion_render_id) {
      const existingRealId = (existingRender.content_config as any).real_remotion_render_id;
      console.log(`⏭️ Already started: real_remotion_render_id=${existingRealId}, returning no-op`);
      return new Response(
        JSON.stringify({
          success: true,
          renderId: pendingRenderId,
          lambdaRenderId: existingRealId,
          bucketName: (existingRender.content_config as any).bucket_name || 'remotionlambda-eucentral1-13gm4o6s90',
          alreadyStarted: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existingRender?.status === 'completed') {
      console.log(`⏭️ Render already completed, returning no-op`);
      return new Response(
        JSON.stringify({ success: true, renderId: pendingRenderId, alreadyStarted: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ PAYLOAD MODE: strict-minimal bypasses normalizeStartPayload entirely
    const isStrictMinimal = lambdaPayload._payloadMode === 'strict-minimal';
    let normalizedPayload: any;
    
    if (isStrictMinimal) {
      console.log('🔧 Using STRICT MINIMAL payload (bypassing normalizeStartPayload)');
      normalizedPayload = { ...lambdaPayload };
      delete normalizedPayload._payloadMode; // Don't send internal marker to Lambda
      if (!normalizedPayload.bucketName) {
        normalizedPayload.bucketName = 'remotionlambda-eucentral1-13gm4o6s90';
      }
    } else {
      // ✅ FULL PAYLOAD NORMALIZATION: Apply all required Remotion v4.0.424 fields
      normalizedPayload = normalizeStartPayload(lambdaPayload);
      if (!normalizedPayload.bucketName) {
        normalizedPayload.bucketName = 'remotionlambda-eucentral1-13gm4o6s90';
      }
    }

    // ✅ SCHEDULING GUARD: hard-reject if both strategies survived normalization
    const hasFramesPerLambda = 'framesPerLambda' in normalizedPayload && normalizedPayload.framesPerLambda != null;
    const hasConcurrency = 'concurrency' in normalizedPayload && (normalizedPayload as any).concurrency != null;
    
    if (hasFramesPerLambda && hasConcurrency) {
      const msg = `Scheduling conflict: both framesPerLambda(${normalizedPayload.framesPerLambda}) and concurrencyPerLambda(${normalizedPayload.concurrencyPerLambda}) are set. Remotion rejects this.`;
      console.error(`❌ ${msg}`);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ r13: FRAME-RANGE GUARD — auto-patch if missing
    const fr = normalizedPayload.frameRange;
    const frValid = Array.isArray(fr) && fr.length === 2 && typeof fr[0] === 'number' && typeof fr[1] === 'number' && fr[0] <= fr[1];
    let frameRangeAutoPatched = false;
    if (!frValid) {
      const dur = normalizedPayload.durationInFrames as number | undefined;
      if (dur && dur > 0) {
        normalizedPayload.frameRange = [0, dur - 1];
        frameRangeAutoPatched = true;
        console.log(`🔧 frameRange_auto_patched: [0, ${dur - 1}] (was ${JSON.stringify(fr)})`);
      } else {
        normalizedPayload.frameRange = [0, 59];
        frameRangeAutoPatched = true;
        console.log(`🔧 frameRange_auto_patched: [0, 59] fallback (no durationInFrames, was ${JSON.stringify(fr)})`);
      }
    }

    // ✅ r15: ENV-VARIABLES GUARD — auto-patch if missing or not an object
    let envVariablesAutoPatched = false;
    if (!normalizedPayload.envVariables || typeof normalizedPayload.envVariables !== 'object' || Array.isArray(normalizedPayload.envVariables)) {
      normalizedPayload.envVariables = {};
      envVariablesAutoPatched = true;
      console.log('🔧 envVariables_auto_patched: set to {} (was missing or invalid)');
    }

    // Diagnostic logging (no sensitive data)
    const diag = payloadDiagnostics(normalizedPayload);
    const payloadKeyFlags = {
      hasFramesPerLambda,
      hasConcurrency,
      frameRangeAutoPatched,
      envVariablesAutoPatched,
      frameRangeValue: normalizedPayload.frameRange,
      keys: Object.keys(normalizedPayload).sort(),
    };
    console.log('🔧 Normalized payload diagnostics:', JSON.stringify(diag));
    console.log('🔧 Payload key flags:', JSON.stringify(payloadKeyFlags));

    // ✅ Payload size check
    const rawJson = JSON.stringify(normalizedPayload);
    const payloadBytes = new TextEncoder().encode(rawJson).length;
    console.log(`📦 Payload size: ${payloadBytes} bytes`);

    // ✅ Initialize AWS client
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region: AWS_REGION,
    });

    const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;

    // ASCII-safe JSON encoding for Umlaute
    const asciiSafeJson = rawJson.replace(/[\u0080-\uffff]/g, (char) => {
      const hex = char.charCodeAt(0).toString(16).padStart(4, '0');
      return String.fromCharCode(92) + 'u' + hex;
    });

    const bucketName = normalizedPayload.bucketName || 'remotionlambda-eucentral1-13gm4o6s90';
    const outName = normalizedPayload.outName || null;

    // ✅ Read existing content_config to preserve data
    const { data: renderRow } = await supabase
      .from('video_renders')
      .select('content_config')
      .eq('render_id', pendingRenderId)
      .maybeSingle();
    const existingConfig = (renderRow?.content_config as any) || {};

    // ============================================
    // ✅ PRIMARY: RequestResponse mode (synchronous)
    //    Returns real renderId + bucketName immediately
    //    Only works if payload < 6MB (always true for us)
    // ============================================

    let trackingMode = 'request_response';
    let realRemotionRenderId: string | null = null;
    let lambdaRequestId: string | null = null;
    let lambdaError: string | null = null;

    // Mark as rendering BEFORE call
    await supabase.from('video_renders').update({
      status: 'rendering',
      bucket_name: bucketName,
      content_config: {
        ...existingConfig,
        lambda_invoked_at: new Date().toISOString(),
        lambda_render_id: pendingRenderId,
        bucket_name: bucketName,
        out_name: outName,
        lambda_function: LAMBDA_FUNCTION_NAME,
        serve_url: serveUrl.substring(0, 120),
      },
    }).eq('render_id', pendingRenderId);

    if (progressId) {
      const { data: progressRow } = await supabase
        .from('universal_video_progress')
        .select('result_data')
        .eq('id', progressId)
        .maybeSingle();
      const existingResultData = (progressRow?.result_data as any) || {};

      await supabase.from('universal_video_progress').update({
        current_step: 'rendering',
        progress_percent: 90,
        status_message: '🎬 Video wird gerendert...',
        result_data: {
          ...existingResultData,
          renderId: pendingRenderId,
          bucketName,
          outName,
        },
        updated_at: new Date().toISOString(),
      }).eq('id', progressId);
    }

    console.log('📝 DB updated to rendering status');

    try {
      console.log('🚀 Invoking Lambda in RequestResponse mode...');

      const lambdaResponse = await aws.fetch(lambdaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: asciiSafeJson,
      });

      lambdaRequestId = lambdaResponse.headers.get('x-amzn-requestid') || null;
      console.log(`📥 Lambda response: status=${lambdaResponse.status}, requestId=${lambdaRequestId}`);

      if (lambdaResponse.ok) {
        const responseBody = await lambdaResponse.text();
        console.log(`📥 Lambda body (first 500 chars): ${responseBody.substring(0, 500)}`);

        try {
          const parsed = JSON.parse(responseBody);

          // Remotion Lambda returns { renderId, bucketName, ... } on success
          if (parsed.renderId) {
            realRemotionRenderId = parsed.renderId;
            console.log(`✅ Got real_remotion_render_id: ${realRemotionRenderId}`);
          } else if (parsed.type === 'error' || parsed.errorMessage || parsed.errorType) {
            // Lambda returned an error in the response body — log FULL object
            lambdaError = parsed.errorMessage || parsed.message || JSON.stringify(parsed);
            console.error(`❌ Lambda returned error (full): ${JSON.stringify(parsed).substring(0, 2000)}`);
            console.error(`❌ Lambda error type: ${parsed.errorType || parsed.type || 'unknown'}`);
            console.error(`❌ Lambda stack: ${(parsed.stackTrace || parsed.stack || '').substring(0, 1000)}`);
            
            // Persist full error details in content_config for forensic analysis
            try {
              await supabase.from('video_renders').update({
                content_config: {
                  ...existingConfig,
                  lambda_error_full: JSON.stringify(parsed).substring(0, 3000),
                  lambda_error_type: parsed.errorType || parsed.type || null,
                  lambda_error_stack: (parsed.stackTrace || parsed.stack || '').substring(0, 2000),
                  lambda_error_name: parsed.name || null,
                },
              }).eq('render_id', pendingRenderId);
            } catch (persistErr) {
              console.warn('⚠️ Could not persist full error details:', persistErr);
            }
          }
        } catch (parseErr) {
          console.warn('⚠️ Could not parse Lambda response as JSON:', parseErr);
          // If body contains "renderId" string, try regex extraction
          const match = responseBody.match(/"renderId"\s*:\s*"([^"]+)"/);
          if (match) {
            realRemotionRenderId = match[1];
            console.log(`✅ Extracted renderId via regex: ${realRemotionRenderId}`);
          }
        }
      } else {
        const errorText = await lambdaResponse.text();
        lambdaError = `Lambda HTTP ${lambdaResponse.status}: ${errorText.substring(0, 500)}`;
        console.error(`❌ Lambda request failed: ${lambdaError}`);

        // 429 = rate limit → fall back to Event mode
        if (lambdaResponse.status === 429) {
          trackingMode = 'event_fallback_429';
          lambdaError = null; // Don't treat as fatal, will retry via Event
        }
      }
    } catch (fetchErr: any) {
      // Timeout or network error → fall back to Event mode
      const isTimeout = fetchErr.name === 'AbortError';
      console.warn(`⚠️ RequestResponse ${isTimeout ? 'timed out' : 'failed'}: ${fetchErr.message}`);
      trackingMode = isTimeout ? 'event_fallback_timeout' : 'event_fallback_error';
    }

    // ============================================
    // ✅ FALLBACK: Event mode (async, fire-and-forget)
    //    Only used if RequestResponse failed due to timeout/rate-limit
    // ============================================

    if (!realRemotionRenderId && !lambdaError && trackingMode.startsWith('event_fallback')) {
      console.log(`🔄 Falling back to Event mode (reason: ${trackingMode})...`);

      if (payloadBytes > MAX_EVENT_PAYLOAD_BYTES) {
        lambdaError = `Payload too large for Event mode (${Math.round(payloadBytes / 1024)}KB > 256KB)`;
        console.error(`❌ ${lambdaError}`);
      } else {
        try {
          const eventResponse = await aws.fetch(lambdaUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Amz-Invocation-Type': 'Event',
            },
            body: asciiSafeJson,
          });

          console.log(`📥 Lambda Event response: ${eventResponse.status}`);

          if (eventResponse.status === 202 || eventResponse.ok) {
            console.log('✅ Lambda accepted job in Event mode');
            // No real render ID available — reconciliation will happen via outName
          } else {
            const errorText = await eventResponse.text();
            lambdaError = `Lambda Event HTTP ${eventResponse.status}: ${errorText.substring(0, 300)}`;
            console.error(`❌ Event mode also failed: ${lambdaError}`);
          }
        } catch (eventErr: any) {
          lambdaError = `Event mode fetch error: ${eventErr.message}`;
          console.error(`❌ ${lambdaError}`);
        }
      }
    }

    // ============================================
    // ✅ HANDLE RESULTS
    // ============================================

    if (lambdaError) {
      // IMMEDIATE FAILURE — report concrete error, don't wait for 12-min timeout
      console.error(`❌ Lambda failed definitively: ${lambdaError}`);

      // ✅ CREDIT REFUND on immediate failure (idempotent via refund_marker)
      const alreadyRefunded = existingConfig?.credit_refund_done === true;
      if (!alreadyRefunded && userId) {
        try {
          // Try to extract credits_used from content_config or webhook customData
          const creditsUsed = existingConfig?.credits_used || 
            (lambdaPayload?.webhook?.customData?.credits_used) || 0;
          if (creditsUsed > 0) {
            const { error: refundError } = await supabase.rpc('increment_balance', {
              p_user_id: userId,
              p_amount: creditsUsed,
            });
            if (!refundError) {
              console.log(`💰 Refunded ${creditsUsed} credits to user ${userId} (immediate Lambda failure)`);
            } else {
              console.error('💰 Refund failed:', refundError);
            }
          }
        } catch (refundErr) {
          console.error('💰 Refund error:', refundErr);
        }
      }

      await supabase.from('video_renders').update({
        status: 'failed',
        error_message: lambdaError.substring(0, 1000),
        completed_at: new Date().toISOString(),
        content_config: {
          ...existingConfig,
          lambda_error: lambdaError.substring(0, 500),
          tracking_mode: trackingMode,
          lambda_request_id: lambdaRequestId,
          lambda_function: LAMBDA_FUNCTION_NAME,
          credit_refund_done: true,
          // ✅ Payload diagnostics for forensic analysis
          payload_diagnostics: diag,
          serve_url: serveUrl.substring(0, 120),
        },
      }).eq('render_id', pendingRenderId);

      if (progressId) {
        await supabase.from('universal_video_progress').update({
          current_step: 'failed',
          status: 'failed',
          progress_percent: 0,
          status_message: `Lambda-Fehler: ${lambdaError.substring(0, 200)}`,
          updated_at: new Date().toISOString(),
        }).eq('id', progressId);
      }

      return new Response(
        JSON.stringify({ error: lambdaError.substring(0, 300), retryable: trackingMode.includes('429') }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SUCCESS — persist tracking data + payload diagnostics for forensics
    // ✅ Generate payload hash for forensic correlation
    const payloadHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawJson))
      .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16))
      .catch(() => 'hash-failed');
    
    const finalConfig: any = {
      ...existingConfig,
      lambda_invoked_at: new Date().toISOString(),
      lambda_render_id: pendingRenderId,
      bucket_name: bucketName,
      out_name: outName,
      tracking_mode: trackingMode,
      lambda_request_id: lambdaRequestId,
      lambda_function: LAMBDA_FUNCTION_NAME,
      lambda_accepted: true,
      // ✅ Enhanced forensics for debugging
      payload_hash: payloadHash,
      serve_url_full: serveUrl,
      payload_size_bytes: payloadBytes,
      bundle_probe: `canary=2026-03-04-r15-envVariables-fix,sanitizer=v13`,
      payload_mode: isStrictMinimal ? 'strict-minimal' : 'normalized',
      // ✅ Track whether diag flags are present in the payload
      diag_flags_applied: !!(lambdaPayload?.inputProps?.payload && JSON.parse(lambdaPayload.inputProps.payload)?.diag),
      diag_flags_effective: (() => { try { return JSON.parse(lambdaPayload?.inputProps?.payload || '{}')?.diag || null; } catch { return null; } })(),
      diagnosticProfile: (() => { try { return JSON.parse(lambdaPayload?.inputProps?.payload || '{}')?.diag?.diagnosticProfile || null; } catch { return null; } })(),
      payload_key_flags: payloadKeyFlags,
      payload_diagnostics: diag,
      scheduling_strategy: hasFramesPerLambda ? 'framesPerLambda' : hasConcurrency ? 'concurrency' : 'remotion-auto',
      scheduling_values: {
        framesPerLambda: normalizedPayload.framesPerLambda,
        concurrency: normalizedPayload.concurrency,
        concurrencyPerLambda: (normalizedPayload as any).concurrencyPerLambda ?? 'NOT_SET',
        concurrencyIsNull: normalizedPayload.concurrency === null,
        hasConcurrencyKey: 'concurrency' in normalizedPayload,
      },
    };

    if (realRemotionRenderId) {
      finalConfig.real_remotion_render_id = realRemotionRenderId;
    }

    await supabase.from('video_renders').update({
      status: 'rendering',
      content_config: finalConfig,
    }).eq('render_id', pendingRenderId);

    console.log(`✅ Render started: tracking_mode=${trackingMode}, real_id=${realRemotionRenderId || 'pending-reconciliation'}`);

    return new Response(
      JSON.stringify({
        success: true,
        renderId: pendingRenderId,
        lambdaRenderId: realRemotionRenderId || pendingRenderId,
        realRemotionRenderId: realRemotionRenderId || null,
        bucketName,
        trackingMode,
        async: trackingMode.startsWith('event_fallback'),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ invoke-remotion-render error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
