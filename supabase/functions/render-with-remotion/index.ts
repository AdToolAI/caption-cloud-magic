import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { LambdaClient, InvokeCommand } from "https://esm.sh/@aws-sdk/client-lambda@3.540.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Fetch Remotion template (optional for UniversalVideo)
    let template = null;
    if (component_name !== 'UniversalVideo') {
      const { data: templateData, error: templateError } = await supabaseClient
        .from('remotion_templates')
        .select('*')
        .eq('component_name', component_name)
        .eq('is_active', true)
        .single();

      if (templateError || !templateData) {
        return new Response(JSON.stringify({ error: 'Template not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      template = templateData;
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
      template_config: template
    });

    // Get AWS credentials and Lambda ARN
    const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
    const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const AWS_REGION = Deno.env.get('AWS_REGION') || 'eu-central-1';
    const LAMBDA_FUNCTION_ARN = Deno.env.get('REMOTION_LAMBDA_FUNCTION_ARN');

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured');
    }

    if (!LAMBDA_FUNCTION_ARN) {
      throw new Error('REMOTION_LAMBDA_FUNCTION_ARN not configured');
    }

    // Prepare Remotion Lambda render request
    const render_id = `remotion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Build input props from customizations and template
    const inputProps = {
      ...customizations,
      template: component_name,
      aspectRatio: aspect_ratio
    };

    console.log('Triggering AWS Lambda render with props:', inputProps);

    // Initialize AWS Lambda Client
    const lambdaClient = new LambdaClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });

    // Prepare Lambda payload
    const lambdaPayload = {
      serveUrl: template?.serve_url || 'https://remotion-bucket.s3.amazonaws.com/bundle',
      composition: component_name,
      inputProps,
      codec: format === 'mp4' ? 'h264' : 'h264',
      imageFormat: 'jpeg',
      privacy: 'public',
      maxRetries: 3,
      framesPerLambda: 20,
      width: dimensions.width,
      height: dimensions.height,
      fps: 30,
      durationInFrames: durationInFrames,
      outputLocation: {
        type: 's3',
        bucketName: 'remotion-renders',
        key: `${render_id}.${format}`,
      },
    };

    console.log('Invoking Lambda with payload:', lambdaPayload);

    // Invoke AWS Lambda
    const invokeCommand = new InvokeCommand({
      FunctionName: LAMBDA_FUNCTION_ARN,
      InvocationType: 'RequestResponse',
      Payload: new TextEncoder().encode(JSON.stringify(lambdaPayload)),
    });

    let lambdaResponse;
    try {
      lambdaResponse = await lambdaClient.send(invokeCommand);
    } catch (lambdaError) {
      console.error('Lambda invocation error:', lambdaError);
      throw new Error(`Failed to invoke Lambda: ${lambdaError instanceof Error ? lambdaError.message : 'Unknown error'}`);
    }

    // Parse Lambda response
    const responsePayload = lambdaResponse.Payload 
      ? JSON.parse(new TextDecoder().decode(lambdaResponse.Payload))
      : null;

    console.log('Lambda response:', responsePayload);

    if (lambdaResponse.FunctionError || !responsePayload?.outputUrl) {
      const errorMessage = responsePayload?.errorMessage || 'Unknown Lambda error';
      console.error('Lambda function error:', errorMessage);
      
      // Update project status to failed
      await supabaseClient
        .from('content_projects')
        .update({
          status: 'failed',
          render_id,
        })
        .eq('id', project_id);
      
      throw new Error(`Remotion render failed: ${errorMessage}`);
    }

    // Extract output URL from Lambda response
    const s3_output_url = responsePayload.outputUrl;
    
    console.log('Downloading video from S3:', s3_output_url);

    // Download video from S3
    const s3Response = await fetch(s3_output_url);
    if (!s3Response.ok) {
      throw new Error(`Failed to download video from S3: ${s3Response.statusText}`);
    }
    
    const videoBlob = await s3Response.blob();
    console.log('Video downloaded, size:', videoBlob.size);

    // Upload to Supabase Storage
    const storage_path = `${user.id}/${render_id}.${format}`;
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('universal-videos')
      .upload(storage_path, videoBlob, {
        contentType: `video/${format}`,
        upsert: true
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(`Failed to upload to storage: ${uploadError.message}`);
    }

    console.log('Video uploaded to storage:', storage_path);

    // Generate signed URL (valid for 24 hours)
    const { data: signedUrlData, error: signedUrlError } = await supabaseClient.storage
      .from('universal-videos')
      .createSignedUrl(storage_path, 86400); // 24 hours

    if (signedUrlError) {
      throw new Error(`Failed to create signed URL: ${signedUrlError.message}`);
    }

    const final_url = signedUrlData.signedUrl;
    console.log('Signed URL generated:', final_url.substring(0, 50) + '...');

    // Insert into video_renders table
    const { error: renderError } = await supabaseClient
      .from('video_renders')
      .insert({
        id: render_id,
        project_id,
        user_id: user.id,
        component_name,
        status: 'completed',
        output_url: final_url,
        storage_path,
        s3_url: s3_output_url,
        width: dimensions.width,
        height: dimensions.height,
        fps: 30,
        duration_frames: durationInFrames,
        file_size: videoBlob.size,
        credits_used: credits_required,
        completed_at: new Date().toISOString(),
      });

    if (renderError) {
      console.error('Failed to insert video_render:', renderError);
    }

    // Update project with completed render
    await supabaseClient
      .from('content_projects')
      .update({
        status: 'completed',
        render_id,
        output_video_url: final_url,
        output_urls: {
          [aspect_ratio]: final_url
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', project_id);

    console.log('Remotion render completed:', {
      render_id,
      s3_url: s3_output_url,
      storage_url: final_url,
      credits_used: credits_required
    });

    return new Response(JSON.stringify({
      ok: true,
      render_id,
      output_url: final_url,
      storage_path,
      status: 'completed',
      credits_used: credits_required,
      engine: 'remotion'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Remotion render error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
