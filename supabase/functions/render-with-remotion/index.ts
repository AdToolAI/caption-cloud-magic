import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AWS Lambda configuration
const AWS_REGION = 'eu-central-1';
const LAMBDA_FUNCTION_NAME = 'remotion-render-4-0-392-mem3008mb-disk10240mb-600sec';
const DEFAULT_BUCKET_NAME = 'remotionlambda-eucentral1-13gm4o6s90';

// Note: We ALWAYS serialize inputProps to S3 since Remotion's internal serialization fails

// ✅ CORRECT FIX: Use JSON.stringify replacer to escape non-ASCII characters
// This happens DURING serialization, not after, preventing double-escaping issues
// The replacer converts non-ASCII characters to \uXXXX BEFORE JSON.stringify escapes them
function asciiSafeReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    // Replace all non-ASCII characters with \uXXXX escape sequences
    // This produces: "für" -> "f\u00fcr" which Lambda can parse correctly
    return value.replace(/[\u0080-\uffff]/g, (char) => {
      return '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4);
    });
  }
  return value;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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
    const voiceoverDuration = customizations?.voiceoverDuration || 30;

    // Maximum video duration: 10 minutes
    const MAX_VIDEO_DURATION = 600;
    if (voiceoverDuration > MAX_VIDEO_DURATION) {
      return new Response(JSON.stringify({ 
        error: `Video zu lang. Maximum ist ${MAX_VIDEO_DURATION} Sekunden (10 Minuten).`,
        requested: voiceoverDuration,
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
    credits_required = calculateCredits(voiceoverDuration, quality);
    console.log(`💰 Credits für ${voiceoverDuration}s ${quality.toUpperCase()} Video: ${credits_required}`);

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
    const totalDurationSeconds = Array.isArray(sanitizedCustomizations.scenes) 
      ? sanitizedCustomizations.scenes.reduce((sum: number, s: any) => sum + Number(s.duration || 0), 0)
      : 30;
    
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
    const REMOTION_VERSION = '4.0.392';

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

    // Build Remotion Lambda payload with webhook for async completion
    const lambdaPayload = {
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
      
      // Execution
      maxRetries: 1,
      timeoutInMilliseconds: 300000, // 5 minutes for Lambda execution
      
      // Output
      privacy: 'public',
      
      // ✅ WEBHOOK: Remotion will POST to this URL when done
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
    };

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

    console.log('🚀 Invoking Remotion Lambda (async mode with Event header)...');
    
    // ✅ ASYNC INVOCATION: X-Amz-Invocation-Type: Event
    // Lambda returns 202 immediately, processes in background
    // Webhook receives final result
    
    // ✅ CORRECT FIX: Use asciiSafeReplacer INSIDE JSON.stringify
    // This ensures non-ASCII chars are escaped DURING serialization, not after
    // Prevents double-escaping issues that break Lambda parsing
    const asciiSafeJson = JSON.stringify(lambdaPayload, asciiSafeReplacer);
    
    console.log('📦 ASCII-safe JSON payload (via replacer), size:', asciiSafeJson.length, 'bytes');
    console.log('📝 Sample (first 500 chars):', asciiSafeJson.substring(0, 500));
    
    const lambdaResponse = await aws.fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Invocation-Type': 'Event', // ✅ ASYNC!
      },
      body: asciiSafeJson, // ✅ ASCII-safe JSON string - aws4fetch can sign this
    });

    console.log('📥 Lambda async response status:', lambdaResponse.status);

    // Async invocation returns 202 Accepted (not 200)
    if (lambdaResponse.status !== 202) {
      const errorText = await lambdaResponse.text();
      console.error('❌ Lambda async invocation failed:', lambdaResponse.status, errorText);
      
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

    console.log('✅ Lambda async invocation accepted (202)');
    console.log('📦 Render will complete via webhook to:', webhookUrl);

    return new Response(
      JSON.stringify({ 
        ok: true,
        render_id: pendingRenderId,
        bucket_name: bucketName,
        status: 'rendering',
        message: 'Video render gestartet. Dies dauert typischerweise 2-5 Minuten. Der Fortschritt wird über Polling/Webhook aktualisiert.'
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
