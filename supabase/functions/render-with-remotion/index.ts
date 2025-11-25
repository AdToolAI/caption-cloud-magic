import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';

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
    const { data: project, error: projectError } = await supabaseClient
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
    const { data: wallet } = await supabaseClient
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
    await supabaseClient.rpc('deduct_credits', {
      p_user_id: user.id,
      p_amount: credits_required
    });

    // Update project status
    await supabaseClient
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

    // Generate unique render ID
    const uniqueRenderId = `remotion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Build input props from customizations
    const inputProps = {
      ...customizations,
      template: component_name,
      aspectRatio: aspect_ratio
    };

    // Determine component name (default to UniversalTemplate)
    const componentName = component_name || 'UniversalTemplate';
    const serveUrl = REMOTION_SERVE_URL;

    // Extract region from Lambda ARN
    const region = extractRegionFromArn(LAMBDA_FUNCTION_ARN);
    console.log('Using AWS region:', region);

    // Construct Lambda invocation URL
    const lambdaUrl = `https://lambda.${region}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_ARN}/invocations`;

    // Create AWS client for signing requests
    const awsClient = new AwsClient({
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region,
      service: 'lambda',
    });

    // Invoke Lambda with webhook configuration
    try {
      // Add webhook configuration to payload
      const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/remotion-webhook`;
      
      const startPayload = {
        type: 'start',
        serveUrl,
        composition: componentName,
        inputProps: inputProps,
        codec: format === 'mp4' ? 'h264' : 'gif',
        imageFormat: 'jpeg',
        version: '4.0.377',
        webhook: {
          url: webhookUrl,
          secret: null
        },
        outputWidth: dimensions.width,
        outputHeight: dimensions.height,
        durationInFrames: durationInFrames,
        fps: 30,
        timeoutInMilliseconds: 300000, // 5 Minuten Timeout
        framesPerLambda: 150 // Empfohlener Standardwert
      };

      console.log('Invoking Lambda with webhook:', { ...startPayload, webhook: webhookUrl });

      const lambdaResponse = await awsClient.fetch(lambdaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(startPayload),
      });

      const responseText = await lambdaResponse.text();
      console.log('Lambda raw response:', responseText);

      if (!lambdaResponse.ok) {
        throw new Error(`Lambda returned status ${lambdaResponse.status}: ${responseText}`);
      }

      // Parse Lambda start response
      const startResponse = JSON.parse(responseText);
      console.log('Lambda start response:', startResponse);

      if (startResponse.errorMessage || startResponse.errorType) {
        throw new Error(`Lambda function error: ${startResponse.errorMessage || startResponse.errorType}`);
      }

      // Extract renderId and bucketName from start response
      const { renderId, bucketName } = startResponse;
      
      if (!renderId || !bucketName) {
        throw new Error('Lambda start response missing renderId or bucketName');
      }

      console.log('Render started:', { renderId, bucketName });
      console.log('Webhook will be called when rendering completes');

      // Create or update video_renders entry with rendering status
      const { error: renderError } = await supabaseClient
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
      await supabaseClient
        .from('content_projects')
        .update({
          status: 'failed',
          error_message: lambdaError instanceof Error ? lambdaError.message : 'Unknown error'
        })
        .eq('id', project_id);

      // Refund credits
      await supabaseClient.rpc('increment_balance', {
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
