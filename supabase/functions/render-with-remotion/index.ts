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

    // Prepare Remotion Lambda render request
    const render_id = `remotion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Build input props from customizations
    const inputProps = {
      ...customizations,
      template: component_name,
      aspectRatio: aspect_ratio
    };

    console.log('Remotion configuration:', {
      serveUrl: REMOTION_SERVE_URL,
      composition: component_name,
      inputProps
    });

    // Extract region from Lambda ARN (more reliable than AWS_REGION env var)
    const region = extractRegionFromArn(LAMBDA_FUNCTION_ARN);
    console.log('Extracted AWS region from ARN:', region);

    // Initialize AWS Client (Deno-compatible)
    const awsClient = new AwsClient({
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      region: region,
    });

    // Prepare Lambda payload matching Remotion's expected format
    const lambdaPayload = {
      type: 'start',
      version: '4.0.377',
      serveUrl: REMOTION_SERVE_URL,
      composition: component_name,
      inputProps,
      codec: 'h264',
      imageFormat: 'jpeg',
      privacy: 'public',
      maxRetries: 1,
      framesPerLambda: 20,
      width: dimensions.width,
      height: dimensions.height,
      fps: 30,
      durationInFrames: durationInFrames,
      outName: `${render_id}.${format}`,
    };

    console.log('Invoking Lambda with payload:', JSON.stringify(lambdaPayload, null, 2));

    // Invoke AWS Lambda via HTTP with AWS Signature V4
    const lambdaUrl = `https://lambda.${region}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_ARN}/invocations`;
    console.log('Lambda URL:', lambdaUrl);

    let lambdaResponse;
    try {
      lambdaResponse = await awsClient.fetch(lambdaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(lambdaPayload),
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
      console.log('Polling for render completion...');

      // Initial delay before first poll (Lambda needs time to prepare)
      console.log('Waiting 5 seconds before first progress check...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Poll for render completion
      let outputUrl: string | null = null;
      let attempts = 0;
      const maxAttempts = 150; // Max 5 minutes (150 × 2 seconds)
      const pollInterval = 2000; // 2 seconds

      while (!outputUrl && attempts < maxAttempts) {
        // Wait before polling (except first iteration, already waited above)
        if (attempts > 0) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        attempts++;

        // Call Lambda with type: 'progress'
        const progressPayload = {
          type: 'progress',
          version: '4.0.377',
          bucketName,
          renderId,
        };

        console.log(`Polling attempt ${attempts}/${maxAttempts}...`);

        try {
          const progressResponse = await awsClient.fetch(lambdaUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(progressPayload),
          });

          const progressText = await progressResponse.text();
          console.log(`Progress response status: ${progressResponse.status}, body length: ${progressText.length}`);
          
          if (!progressResponse.ok) {
            console.error('Progress check failed:', progressText);
            throw new Error(`Progress check failed: ${progressText}`);
          }

          // Handle empty or invalid responses
          if (!progressText || progressText.trim() === '') {
            console.log('Empty response from Lambda, retrying...');
            continue;
          }

          // Parse progress response with error handling
          let progress;
          try {
            progress = JSON.parse(progressText);
          } catch (parseError) {
            console.error('Failed to parse progress response:', parseError);
            console.log('Raw response:', progressText.substring(0, 200));
            console.log('Will retry on next poll...');
            continue;
          }

          console.log('Render progress:', {
            done: progress.done,
            overallProgress: progress.overallProgress ? `${(progress.overallProgress * 100).toFixed(1)}%` : 'N/A',
            outputFile: progress.outputFile ? 'present' : 'missing'
          });

          // Check for fatal errors
          if (progress.fatalErrorEncountered) {
            const errorMessage = progress.errors?.join(', ') || 'Unknown render error';
            throw new Error(`Render failed: ${errorMessage}`);
          }

          // Check if render is complete
          if (progress.done && progress.outputFile) {
            outputUrl = progress.outputFile;
            console.log('Render completed successfully!');
            break;
          }
        } catch (pollError) {
          console.error(`Poll attempt ${attempts} error:`, pollError);
          // Continue polling unless it's a fatal error
          if (pollError instanceof Error && pollError.message?.includes('Render failed:')) {
            throw pollError;
          }
          // Otherwise continue to next attempt
        }
      }

      if (!outputUrl) {
        throw new Error(`Render timeout after ${maxAttempts * pollInterval / 1000} seconds`);
      }
      console.log('Downloading video from:', outputUrl);

      // Download video from output URL
      const videoResponse = await fetch(outputUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
      }
      
      const videoBlob = await videoResponse.blob();
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
      console.log('Signed URL generated');

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
          s3_url: outputUrl,
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

      console.log('Remotion render completed successfully');

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

    } catch (lambdaError) {
      console.error('Lambda invocation error:', lambdaError);
      
      // Update project status to failed
      await supabaseClient
        .from('content_projects')
        .update({
          status: 'failed',
          render_id,
        })
        .eq('id', project_id);

      throw new Error(`Failed to invoke Lambda: ${lambdaError instanceof Error ? lambdaError.message : 'Unknown error'}`);
    }

  } catch (error) {
    console.error('Remotion render error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
