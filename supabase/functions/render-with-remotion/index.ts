import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AWS Lambda configuration
const AWS_REGION = 'eu-central-1';
const LAMBDA_FUNCTION_NAME = 'remotion-render-4-0-377-mem3008mb-disk10240mb-600sec';
const DEFAULT_BUCKET_NAME = 'remotionlambda-eucentral1-13gm4o6s90';

// Note: We ALWAYS serialize inputProps to S3 since Remotion's internal serialization fails

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
      sanitizedCustomizations.scenes = sanitizedCustomizations.scenes
        .filter((s: any) => {
          const dur = Number(s?.duration);
          return Number.isFinite(dur) && dur > 0;
        })
        .map((s: any) => ({
          ...s,
          duration: Math.max(0.1, Math.min(600, Number(s.duration))),
        }));
      
      console.log(`🎬 Scene validation: ${originalCount} -> ${sanitizedCustomizations.scenes.length} valid scenes`);
      
      // Log any invalid scenes for debugging
      if (sanitizedCustomizations.scenes.length < originalCount) {
        console.warn(`⚠️ Filtered out ${originalCount - sanitizedCustomizations.scenes.length} invalid scenes`);
      }
    }

    // Build input props from sanitized customizations
    const inputProps = {
      ...sanitizedCustomizations,
      template: component_name,
      aspectRatio: aspect_ratio,
      targetWidth: dimensions.width,
      targetHeight: dimensions.height
    };

    const componentName = component_name || 'UniversalVideo';
    const bucketName = DEFAULT_BUCKET_NAME;
    const REMOTION_VERSION = '4.0.377';

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

    // Build Remotion Lambda payload
    const lambdaPayload = {
      type: 'start',
      version: REMOTION_VERSION,
      serveUrl: REMOTION_SERVE_URL,
      composition: componentName,
      inputProps: inputPropsForLambda,
      
      // Codec and format settings
      codec: format === 'mp4' ? 'h264' : 'gif',
      imageFormat: 'jpeg',
      jpegQuality: 80,
      
      // Lambda execution settings
      maxRetries: 1,
      framesPerLambda: null,
      concurrency: 1,
      timeoutInMilliseconds: 30000,
      
      // Video settings
      privacy: 'public',
      overwrite: true,
      muted: false,
      scale: 1,
      everyNthFrame: 1,
      frameRange: null,
      x264Preset: 'medium',
      
      // Logging
      logLevel: 'info',
      
      // Required empty objects
      chromiumOptions: {},
      envVariables: {},
      metadata: {},
      downloadBehavior: { type: 'play-in-browser' },
      
      // Optional fields as null
      crf: null,
      colorSpace: null,
      audioBitrate: null,
      videoBitrate: null,
      audioCodec: null,
      outName: null,
      forceHeight: null,
      forceWidth: null,
      webhook: null,
      offthreadVideoCacheSizeInBytes: null,
      deleteAfter: null,
      preferLossless: false,
      forcePathStyle: false,
    };

    console.log('📤 Lambda payload:', JSON.stringify({
      ...lambdaPayload,
      inputProps: `(payload format, ${(inputPropsSize / 1024).toFixed(2)} KB)`,
    }, null, 2));

    const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;

    console.log('🚀 Invoking Remotion Lambda...');
    
    const lambdaResponse = await aws.fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(lambdaPayload),
    });

    console.log('📥 Lambda response status:', lambdaResponse.status);

    if (lambdaResponse.status !== 200) {
      const errorText = await lambdaResponse.text();
      console.error('❌ Lambda invocation failed:', lambdaResponse.status, errorText);
      
      // Refund credits on Lambda failure
      await supabaseAdmin.rpc('increment_balance', {
        p_user_id: userId,
        p_amount: credits_required
      });
      console.log(`💰 Refunded ${credits_required} credits due to Lambda error`);
      
      throw new Error(`Lambda invocation failed with status ${lambdaResponse.status}: ${errorText}`);
    }

    // Parse Lambda response
    const lambdaResult = await lambdaResponse.json();
    console.log('📥 Lambda result:', JSON.stringify(lambdaResult, null, 2));

    // Check for Lambda error
    if (lambdaResult.type === 'error' || lambdaResult.errorMessage || lambdaResult.FunctionError) {
      const errorMsg = lambdaResult.message || lambdaResult.errorMessage || 'Unknown Lambda error';
      console.error('❌ Lambda returned error:', errorMsg);
      
      // Refund credits
      await supabaseAdmin.rpc('increment_balance', {
        p_user_id: userId,
        p_amount: credits_required
      });
      console.log(`💰 Refunded ${credits_required} credits due to Lambda error`);
      
      return new Response(JSON.stringify({ 
        error: 'Video rendering failed: ' + errorMsg,
        details: lambdaResult
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ✅ SUCCESS: Extract the REAL renderId
    const realRenderId = lambdaResult.renderId;
    
    if (!realRenderId) {
      console.error('❌ Lambda did not return renderId:', lambdaResult);
      
      // Refund credits
      await supabaseAdmin.rpc('increment_balance', {
        p_user_id: userId,
        p_amount: credits_required
      });
      console.log(`💰 Refunded ${credits_required} credits - no renderId returned`);
      
      throw new Error('Lambda did not return a renderId');
    }

    console.log('🎉 Got REAL renderId from Lambda:', realRenderId);
    console.log('📦 Expected bucket:', lambdaResult.bucketName || bucketName);

    // Insert render record with the REAL renderId
    const { error: insertError } = await supabaseAdmin
      .from('video_renders')
      .insert({
        render_id: realRenderId,
        project_id,
        bucket_name: lambdaResult.bucketName || bucketName,
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
    }

    console.log('✅ Render started with REAL renderId:', realRenderId);

    return new Response(
      JSON.stringify({ 
        ok: true,
        render_id: realRenderId,
        bucket_name: lambdaResult.bucketName || bucketName,
        status: 'rendering',
        message: 'Video render started. This typically takes 2-3 minutes.'
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
