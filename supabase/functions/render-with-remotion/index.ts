import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { renderMediaOnLambda, speculateFunctionName } from 'npm:@remotion/lambda-client@4.0.377';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract AWS region from Lambda ARN
// ARN format: arn:aws:lambda:{region}:{account}:function:{name}
const extractRegionFromArn = (arn: string): string => {
  const parts = arn.split(':');
  return parts[3] || 'eu-central-1'; // Region is the 4th part (index 3)
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use ANON_KEY client for auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use SERVICE_ROLE_KEY client for database operations (bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { project_id, component_name, customizations, format = 'mp4', aspect_ratio = '9:16' } = await req.json();

    // Calculate dimensions based on aspect ratio
    const calculateDimensions = (aspectRatio: string) => {
      const ratioMap: Record<string, { width: number; height: number }> = {
        '9:16': { width: 1080, height: 1920 },
        '16:9': { width: 1920, height: 1080 },
        '1:1': { width: 1080, height: 1080 },
        '4:5': { width: 1080, height: 1350 },
        '4:3': { width: 1440, height: 1080 },
      };
      return ratioMap[aspectRatio] || { width: 1080, height: 1920 };
    };

    const dimensions = calculateDimensions(aspect_ratio);

    // Calculate duration based on voiceover duration
    const voiceoverDuration = customizations?.voiceoverDuration || 30;
    const durationInFrames = Math.ceil(voiceoverDuration * 30); // 30 fps

    // Fetch project
    const { data: project, error: projectError } = await supabaseAdmin
      .from('content_projects')
      .select('*')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calculate credits (Remotion is 5 credits per video)
    const credits_required = 5;

    // Check credits
    const { data: wallet } = await supabaseAdmin
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
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
      p_user_id: user.id,
      p_amount: credits_required
    });

    // Update project status
    await supabaseAdmin
      .from('content_projects')
      .update({
        status: 'rendering',
        render_engine: 'remotion'
      })
      .eq('id', project_id);

    console.log('Starting Remotion render:', {
      component_name,
      customizations,
      dimensions,
      durationInFrames
    });

    // Get AWS credentials and Lambda ARN
    const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
    const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const LAMBDA_FUNCTION_ARN = Deno.env.get('REMOTION_LAMBDA_FUNCTION_ARN');
    const REMOTION_SERVE_URL = Deno.env.get('REMOTION_SERVE_URL');

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured');
    }

    if (!LAMBDA_FUNCTION_ARN) {
      throw new Error('REMOTION_LAMBDA_FUNCTION_ARN not configured');
    }

    if (!REMOTION_SERVE_URL) {
      throw new Error('REMOTION_SERVE_URL not configured - please deploy your Remotion bundle to S3');
    }

    // Build input props from customizations
    const inputProps = {
      ...customizations,
      template: component_name,
      aspectRatio: aspect_ratio
    };

    // Determine component name (default to UniversalVideo)
    const componentName = component_name || 'UniversalVideo';
    const serveUrl = REMOTION_SERVE_URL;

    // Extract region from Lambda ARN
    const region = extractRegionFromArn(LAMBDA_FUNCTION_ARN);
    console.log('Using AWS region:', region);

    // Set AWS credentials as environment variables for the Lambda client
    Deno.env.set('AWS_ACCESS_KEY_ID', AWS_ACCESS_KEY_ID);
    Deno.env.set('AWS_SECRET_ACCESS_KEY', AWS_SECRET_ACCESS_KEY);

    // Invoke Lambda with webhook configuration using official Remotion client
    try {
      // Add webhook configuration
      const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/remotion-webhook`;
      
      console.log('Starting Remotion render via Lambda client:', {
        serveUrl,
        composition: componentName,
        codec: format === 'mp4' ? 'h264' : 'gif',
        region,
        webhook: webhookUrl
      });

      // Use the official Remotion Lambda client
      const { renderId, bucketName } = await renderMediaOnLambda({
        region: region as any,
        functionName: speculateFunctionName({
          diskSizeInMb: 2048,
          memorySizeInMb: 2048,
          timeoutInSeconds: 120,
        }),
        serveUrl,
        composition: componentName,
        inputProps,
        codec: format === 'mp4' ? 'h264' : 'gif',
        imageFormat: 'jpeg',
        maxRetries: 1,
        privacy: 'public',
        webhook: {
          url: webhookUrl,
          secret: null,
        },
        forceWidth: dimensions.width,
        forceHeight: dimensions.height,
        envVariables: {},
        chromiumOptions: {
          gl: 'swangle'
        },
        forceBucketName: 'remotionlambda-eucentral1-13gm4o6s90',
      });

      console.log('Render started:', { renderId, bucketName });
      console.log('Webhook will be called when rendering completes');

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
          user_id: user.id
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
      
      // Update project status to failed
      await supabaseAdmin
        .from('content_projects')
        .update({
          status: 'failed',
          error_message: lambdaError instanceof Error ? lambdaError.message : 'Unknown error'
        })
        .eq('id', project_id);

      // Refund credits
      await supabaseAdmin.rpc('increment_balance', {
        p_user_id: user.id,
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
