import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.17";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract region from ARN
function extractRegionFromArn(arn: string): string {
  const parts = arn.split(':');
  if (parts.length >= 4) {
    return parts[3];
  }
  throw new Error(`Invalid ARN format: ${arn}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Check Remotion progress request received');
    
    const { render_id, bucket_name } = await req.json();
    
    if (!render_id || !bucket_name) {
      throw new Error('render_id and bucket_name are required');
    }

    console.log('📊 Checking progress for render:', render_id);

    // Get AWS credentials from environment
    const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const lambdaFunctionArn = Deno.env.get('REMOTION_LAMBDA_FUNCTION_ARN');

    if (!awsAccessKeyId || !awsSecretAccessKey || !lambdaFunctionArn) {
      throw new Error('Missing AWS credentials or Lambda ARN');
    }

    // Extract region from ARN
    const awsRegion = extractRegionFromArn(lambdaFunctionArn);
    console.log('🌍 Extracted AWS region:', awsRegion);

    // Create status check payload
    const statusPayload = {
      type: 'status',
      bucketName: bucket_name,
      renderId: render_id,
      version: '4.0.377'
    };

    console.log('📤 Status payload:', JSON.stringify(statusPayload, null, 2));

    // Invoke Lambda with status check
    const lambdaUrl = `https://lambda.${awsRegion}.amazonaws.com/2015-03-31/functions/${lambdaFunctionArn}/invocations`;
    
    const aws = new AwsClient({
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
      region: awsRegion,
      service: 'lambda'
    });

    const signedRequest = await aws.sign(lambdaUrl, {
      method: 'POST',
      body: JSON.stringify(statusPayload),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('🚀 Invoking Lambda for status check...');
    const lambdaResponse = await fetch(signedRequest);
    const lambdaData = await lambdaResponse.json();

    console.log('📥 Lambda status response:', JSON.stringify(lambdaData, null, 2));

    if (!lambdaResponse.ok) {
      throw new Error(`Lambda status check failed: ${JSON.stringify(lambdaData)}`);
    }

    // Parse progress data
    const progress = lambdaData;
    
    // Update database if render is complete or failed
    if (progress.done || progress.fatalErrorEncountered) {
      console.log('✅ Render status changed, updating database...');
      
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      if (progress.done && progress.outputFile) {
        // Render completed successfully
        await supabaseAdmin
          .from('video_renders')
          .update({
            status: 'completed',
            video_url: progress.outputFile,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('render_id', render_id);

        console.log('✅ Marked render as completed in database');
      } else if (progress.fatalErrorEncountered) {
        // Render failed
        const errorMessage = progress.errors?.join(', ') || 'Unknown error';
        
        await supabaseAdmin
          .from('video_renders')
          .update({
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('render_id', render_id);

        console.log('❌ Marked render as failed in database');
      }
    }

    // Return progress data to frontend
    return new Response(
      JSON.stringify({
        success: true,
        render_id,
        progress: {
          done: progress.done || false,
          fatalErrorEncountered: progress.fatalErrorEncountered || false,
          outputFile: progress.outputFile,
          errors: progress.errors,
          overallProgress: progress.overallProgress || 0,
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Error checking Remotion progress:', error);
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
