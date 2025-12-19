import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

// Note: Lambda is invoked synchronously to ensure render_id is written to DB before response

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AWS Lambda configuration
const AWS_REGION = 'eu-central-1';
const LAMBDA_FUNCTION_NAME = 'remotion-render-4-0-377-mem3008mb-disk10240mb-600sec';

// Shutdown handler for logging
addEventListener('beforeunload', (ev: any) => {
  console.log('[render-with-remotion] Function shutdown:', ev.detail?.reason || 'unknown');
});

// Default Remotion bucket name - MUST match check-remotion-progress
// Verified from successful renders in database
const DEFAULT_BUCKET_NAME = 'remotionlambda-eucentral1-13gm4o6s90';

// Invoke Remotion Lambda SYNCHRONOUSLY to get the real renderId
async function invokeRemotionLambdaSync(payload: any): Promise<{ renderId: string; bucketName: string }> {
  const aws = new AwsClient({
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    region: AWS_REGION,
  });

  const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;

  console.log(`🚀 Invoking Remotion Lambda SYNC: ${LAMBDA_FUNCTION_NAME}`);
  
  // Use default 'RequestResponse' invocation type - waits for response
  const response = await aws.fetch(lambdaUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // No X-Amz-Invocation-Type = RequestResponse (synchronous)
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lambda sync invocation failed:', response.status, errorText);
    throw new Error(`Lambda invocation failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log('✅ Lambda sync response:', JSON.stringify(result, null, 2));

  // Remotion Lambda returns the real renderId and bucketName
  if (result.renderId && result.bucketName) {
    return { renderId: result.renderId, bucketName: result.bucketName };
  }
  
  throw new Error('Lambda did not return renderId');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    // Use SERVICE_ROLE_KEY client for database operations (bypass RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse body first to check for userId (backend-to-backend calls)
    const body = await req.json();
    const { project_id, component_name, customizations, format = 'mp4', aspect_ratio = '9:16', quality = 'hd', userId: bodyUserId } = body;
    
    // Determine authentication method
    const authHeader = req.headers.get('Authorization') || '';
    const isServiceCall = authHeader.includes(supabaseServiceKey);
    
    let userId: string;
    
    if (isServiceCall && bodyUserId) {
      // Backend-to-Backend call: userId comes from request body
      userId = bodyUserId;
      console.log('🔐 Service Role authentication - userId from body:', userId);
    } else {
      // Normal User Call: validate JWT
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
    const durationInFrames = Math.ceil(voiceoverDuration * 30); // 30 fps

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

    // Credit calculation based on video duration and quality (tiered pricing)
    const calculateCredits = (durationSeconds: number, videoQuality: string): number => {
      const qualityMultiplier = videoQuality === '4k' ? 2 : 1;
      
      let baseCost: number;
      if (durationSeconds < 30) {
        baseCost = 10;      // < 30 seconds = 10 Credits
      } else if (durationSeconds <= 60) {
        baseCost = 20;      // 30-60 seconds = 20 Credits
      } else if (durationSeconds <= 180) {
        baseCost = 50;      // 1-3 minutes = 50 Credits
      } else if (durationSeconds <= 300) {
        baseCost = 100;     // 3-5 minutes = 100 Credits
      } else {
        baseCost = 200;     // 5-10 minutes = 200 Credits
      }
      
      return baseCost * qualityMultiplier;
    };

    // Fetch project (project_id may be optional for Universal Video Creator)
    let project = null;
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
      project = projectData;
    }

    // Calculate credits based on video duration and quality
    const credits_required = calculateCredits(voiceoverDuration, quality);
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

    console.log('Starting Remotion render:', {
      component_name,
      customizations,
      dimensions,
      durationInFrames
    });

    // Get configuration
    const REMOTION_SERVE_URL = Deno.env.get('REMOTION_SERVE_URL');

    if (!REMOTION_SERVE_URL) {
      throw new Error('REMOTION_SERVE_URL not configured - please deploy your Remotion bundle to S3');
    }

    // Build input props from customizations
    const inputProps = {
      ...customizations,
      template: component_name,
      aspectRatio: aspect_ratio,
      targetWidth: dimensions.width,
      targetHeight: dimensions.height
    };

    // Determine component name (default to UniversalVideo)
    const componentName = component_name || 'UniversalVideo';

    // ============================================
    // ✅ NEW PATTERN: Pending ID + Background Sync Lambda
    // 1. Return immediately with pending-xxx ID
    // 2. Background task calls Lambda SYNC, gets real renderId
    // 3. Updates DB with real renderId
    // ============================================
    
    const pendingRenderId = `pending-${crypto.randomUUID().slice(0, 8)}`;
    const bucketName = DEFAULT_BUCKET_NAME;
    
    const webhookUrl = `${supabaseUrl}/functions/v1/remotion-webhook`;
    
    console.log('🚀 Starting render with pending ID:', pendingRenderId);
    
    // Build Remotion Lambda payload (type: 'start') - NO custom renderId
    // Remotion will generate its own ~10-char renderId
    const lambdaPayload = {
      type: 'start',
      serveUrl: REMOTION_SERVE_URL,
      composition: componentName,
      inputProps,
      codec: format === 'mp4' ? 'h264' : 'gif',
      imageFormat: 'jpeg',
      maxRetries: 1,
      framesPerLambda: 150,
      privacy: 'public',
      // NO renderId - let Remotion generate one
      webhook: {
        url: webhookUrl,
        secret: null,
      },
      overwrite: true,
      frameRange: [0, durationInFrames - 1],
      outName: `render-${project_id || 'universal'}-${Date.now()}.mp4`,
    };

    // ✅ INSERT render record with PENDING ID
    console.log('📝 Inserting render record with pending ID:', pendingRenderId);
    
    const { error: insertError } = await supabaseAdmin
      .from('video_renders')
      .insert({
        render_id: pendingRenderId,
        project_id,
        bucket_name: bucketName,
        format_config: { format, aspect_ratio },
        content_config: customizations,
        subtitle_config: {},
        status: 'queued',
        started_at: new Date().toISOString(),
        user_id: userId
      });

    if (insertError) {
      console.error('Failed to create video_renders entry:', insertError);
      await supabaseAdmin.rpc('increment_balance', {
        p_user_id: userId,
        p_amount: credits_required
      });
      throw new Error('Failed to create render record');
    }
    
    console.log('✅ Pending render record created');

    // ✅ BACKGROUND TASK: Call Lambda SYNC and update DB with real renderId
    // Using EdgeRuntime.waitUntil() to keep function alive after response
    const backgroundTask = async () => {
      try {
        console.log('🔄 Background: Starting sync Lambda invocation...');
        
        const { renderId: realRenderId, bucketName: realBucket } = await invokeRemotionLambdaSync(lambdaPayload);
        
        console.log('✅ Background: Got real renderId:', realRenderId);
        
        // Update DB with real render_id
        const { error: updateError } = await supabaseAdmin
          .from('video_renders')
          .update({ 
            render_id: realRenderId, 
            bucket_name: realBucket,
            status: 'rendering'
          })
          .eq('render_id', pendingRenderId);
        
        if (updateError) {
          console.error('❌ Background: Failed to update render_id:', updateError);
        } else {
          console.log('✅ Background: DB updated with real renderId');
        }
        
        // Update project status
        if (project_id) {
          await supabaseAdmin
            .from('content_projects')
            .update({ status: 'rendering' })
            .eq('id', project_id);
        }
        
      } catch (error) {
        console.error('❌ Background: Lambda failed:', error);
        
        // Update render status to failed
        await supabaseAdmin
          .from('video_renders')
          .update({ 
            status: 'failed', 
            error_message: error instanceof Error ? error.message : 'Lambda invocation failed' 
          })
          .eq('render_id', pendingRenderId);
        
        // Refund credits
        await supabaseAdmin.rpc('increment_balance', {
          p_user_id: userId,
          p_amount: credits_required
        });
        console.log('💰 Background: Credits refunded due to failure');
        
        // Update project status
        if (project_id) {
          await supabaseAdmin
            .from('content_projects')
            .update({
              status: 'failed',
              error_message: error instanceof Error ? error.message : 'Lambda invocation failed'
            })
            .eq('id', project_id);
        }
      }
    };

    // Start background task - function continues even after response
    (globalThis as any).EdgeRuntime?.waitUntil?.(backgroundTask()) || backgroundTask();

    // ✅ Return IMMEDIATELY with pending ID
    return new Response(
      JSON.stringify({ 
        ok: true,
        render_id: pendingRenderId,
        bucket_name: bucketName,
        status: 'queued',
        message: 'Video render queued. Processing will start shortly.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
