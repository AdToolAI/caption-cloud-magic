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

// Invoke Remotion Lambda directly via AWS API
async function invokeRemotionLambda(payload: any): Promise<{ renderId: string; bucketName: string }> {
  const aws = new AwsClient({
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    region: AWS_REGION,
  });

  const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;

  console.log(`🚀 Invoking Remotion Lambda via aws4fetch: ${LAMBDA_FUNCTION_NAME}`);
  
  const response = await aws.fetch(lambdaUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Invocation-Type': 'RequestResponse',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lambda invocation failed:', response.status, errorText);
    throw new Error(`Lambda invocation failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  
  // Check for Lambda function errors
  if (result.errorMessage || result.errorType) {
    console.error('Lambda function error:', result);
    throw new Error(result.errorMessage || 'Lambda function returned an error');
  }

  console.log('✅ Lambda response:', JSON.stringify(result));

  // Remotion Lambda returns { renderId, bucketName } for type: 'start'
  return {
    renderId: result.renderId,
    bucketName: result.bucketName,
  };
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

    try {
      const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/remotion-webhook`;
      
      console.log('🚀 Building Remotion Lambda payload...');
      
      // Build Remotion Lambda payload (type: 'start')
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
        webhook: {
          url: webhookUrl,
          secret: null,
        },
        overwrite: true,
        frameRange: [0, durationInFrames - 1],
        outName: `render-${project_id}-${Date.now()}.mp4`,
      };

      // Invoke Lambda directly
      const response = await invokeRemotionLambda(lambdaPayload);

      console.log('✅ Lambda render initiated:', response);

      const renderId = response.renderId;
      const bucketName = response.bucketName;

      console.log('Render started:', {
        renderId,
        bucketName,
        webhookUrl
      });

      // Create or update video_renders entry with rendering status
      const { error: renderError } = await supabaseAdmin
        .from('video_renders')
        .upsert({
          render_id: renderId,
          project_id,
          bucket_name: bucketName,
          format_config: { format, aspect_ratio },
          content_config: customizations,
          subtitle_config: {},
          status: 'rendering',
          started_at: new Date().toISOString(),
          user_id: userId
        }, {
          onConflict: 'render_id'
        });

      if (renderError) {
        console.error('Failed to create video_renders entry:', renderError);
      }

      // Return immediately - webhook will update status later
      return new Response(
        JSON.stringify({ 
          ok: true,
          render_id: renderId,
          status: 'rendering',
          message: 'Video rendering started. You will be notified when complete.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (lambdaError) {
      console.error('Lambda invocation error:', lambdaError);
      
      // Update project status to failed (only if project_id provided)
      if (project_id) {
        await supabaseAdmin
          .from('content_projects')
          .update({
            status: 'failed',
            error_message: lambdaError instanceof Error ? lambdaError.message : 'Unknown error'
          })
          .eq('id', project_id);
      }

      // Refund credits
      await supabaseAdmin.rpc('increment_balance', {
        p_user_id: userId,
        p_amount: credits_required
      });

      throw lambdaError;
    }

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
