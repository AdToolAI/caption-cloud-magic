import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";
import { normalizeStartPayload, payloadDiagnostics } from "../_shared/remotion-payload.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// AWS Lambda configuration
const AWS_REGION = 'eu-central-1';
function getLambdaFunctionName(): string {
  const arn = Deno.env.get('REMOTION_LAMBDA_FUNCTION_ARN') || '';
  if (arn.includes(':function:')) return arn.split(':function:')[1] || arn;
  return arn || 'remotion-render-4-0-424-mem3008mb-disk2048mb-600sec';
}
const LAMBDA_FUNCTION_NAME = getLambdaFunctionName();
const DEFAULT_BUCKET_NAME = 'remotionlambda-eucentral1-13gm4o6s90';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

    // Update project status (only if project_id provided)
    if (project_id) {
      await supabaseAdmin
        .from('content_projects')
        .update({
          status: 'rendering',
          render_engine: 'remotion'
        })
        .eq('id', project_id);
    }

    console.log('🚀 Starting Remotion render:', {
      component_name,
      dimensions,
    });

    // Get configuration
    const REMOTION_SERVE_URL = Deno.env.get('REMOTION_SERVE_URL');

    if (!REMOTION_SERVE_URL) {
      throw new Error('REMOTION_SERVE_URL not configured');
    }

    // ✅ CRITICAL: Validate and sanitize scenes before sending to Lambda
    let sanitizedCustomizations = { ...customizations };
    
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

    const componentName = component_name || 'UniversalVideo';
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
    const webhookUrl = `${supabaseUrl}/functions/v1/remotion-webhook`;
    
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
      
      // Execution
      maxRetries: 1,
      timeoutInMilliseconds: 300000,
      
      // Output
      privacy: 'public',
      
      // Webhook
      webhook: {
        url: webhookUrl,
        secret: 'remotion-webhook-secret-adtool-2024',
        customData: {
          pending_render_id: pendingRenderId,
          user_id: userId,
          project_id: project_id,
          credits_used: credits_required,
          source: 'universal-creator',
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

    console.log('🚀 Invoking Remotion Lambda (SYNCHRONOUS mode - RequestResponse)...');
    
    // ✅ SYNCHRONOUS INVOCATION: No X-Amz-Invocation-Type header = RequestResponse (default)
    // Lambda processes and returns result directly (typically 45-60 seconds)
    // This was the working approach from December 2025
    
    // ✅ CORRECT FIX: First stringify normally, then post-process to escape non-ASCII
    // toAsciiSafeJson uses String.fromCharCode(92) for a SINGLE backslash
    // This prevents double-escaping that breaks Lambda JSON parsing
    const rawJson = JSON.stringify(lambdaPayload);
    const asciiSafeJson = toAsciiSafeJson(rawJson);
    
    console.log('📦 ASCII-safe JSON payload (post-processed), size:', asciiSafeJson.length, 'bytes');
    console.log('📝 Sample (first 500 chars):', asciiSafeJson.substring(0, 500));
    
    const lambdaResponse = await aws.fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No X-Amz-Invocation-Type header = synchronous RequestResponse (default)
      },
      body: asciiSafeJson,
    });

    console.log('📥 Lambda synchronous response status:', lambdaResponse.status);

    // Synchronous invocation returns 200 OK with the result
    if (!lambdaResponse.ok) {
      const errorText = await lambdaResponse.text();
      console.error('❌ Lambda synchronous invocation failed:', lambdaResponse.status, errorText);
      
      // Clean up render record
      await supabaseAdmin
        .from('video_renders')
        .update({ 
          status: 'failed', 
          error_message: `Lambda invocation failed: ${lambdaResponse.status}`,
          completed_at: new Date().toISOString()
        })
        .eq('render_id', pendingRenderId);
      
      // Refund credits on Lambda failure
      await supabaseAdmin.rpc('increment_balance', {
        p_user_id: userId,
        p_amount: credits_required
      });
      console.log(`💰 Refunded ${credits_required} credits due to Lambda error`);
      
      throw new Error(`Lambda invocation failed with status ${lambdaResponse.status}: ${errorText}`);
    }

    // ✅ Parse synchronous Lambda response - contains renderId, outputFile, bucketName
    const lambdaResult = await lambdaResponse.json();
    console.log('✅ Lambda synchronous response:', JSON.stringify(lambdaResult, null, 2));
    
    const realRenderId = lambdaResult.renderId;
    const outputFile = lambdaResult.outputFile;
    const outputBucket = lambdaResult.outBucket || lambdaResult.bucketName || bucketName;
    
    // Build the real output URL
    const outputUrl = outputFile || 
      `https://s3.${AWS_REGION}.amazonaws.com/${outputBucket}/renders/${realRenderId}/out.mp4`;
    
    console.log('🎬 Real Render ID:', realRenderId);
    console.log('📁 Output URL:', outputUrl);

    // ✅ Update DB with real render data - mark as completed immediately
    const { error: updateError } = await supabaseAdmin
      .from('video_renders')
      .update({
        status: 'completed',
        video_url: outputUrl,
        completed_at: new Date().toISOString(),
      })
      .eq('render_id', pendingRenderId);
    
    if (updateError) {
      console.error('⚠️ Failed to update render record:', updateError);
    } else {
      console.log('✅ Updated render record to completed');
    }

    // ✅ Auto-save to Media Library (video_creations + media_assets)
    try {
      const { data: vcData, error: vcError } = await supabaseAdmin.from('video_creations').insert({
        user_id: userId,
        output_url: outputUrl,
        status: 'completed',
        credits_used: credits_required,
        render_id: realRenderId,
        metadata: {
          title: customizations?.projectTitle || 'Video',
          template_name: componentName,
          render_engine: 'remotion',
          source: 'universal-creator',
        },
      }).select('id').single();
      
      if (vcError) {
        console.error('⚠️ video_creations insert error:', JSON.stringify(vcError));
      } else {
        console.log('✅ Saved to video_creations, id:', vcData?.id);
      }

      const { error: maError } = await supabaseAdmin.from('media_assets').insert({
        user_id: userId,
        type: 'video',
        original_url: outputUrl,
        storage_path: outputUrl,
        source: 'remotion-render',
      });
      
      if (maError) {
        console.error('⚠️ media_assets insert error:', JSON.stringify(maError));
      } else {
        console.log('✅ Saved to media_assets');
      }
    } catch (mediaError) {
      console.error('⚠️ Media Library save failed:', mediaError);
    }

    return new Response(
      JSON.stringify({ 
        ok: true,
        render_id: pendingRenderId,
        real_render_id: realRenderId,
        video_url: outputUrl,
        bucket_name: bucketName,
        status: 'completed',
        message: 'Video-Rendering abgeschlossen!'
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
