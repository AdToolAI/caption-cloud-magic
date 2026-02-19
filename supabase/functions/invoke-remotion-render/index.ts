import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AWS_REGION = 'eu-central-1';
const LAMBDA_FUNCTION_NAME = 'remotion-render-4-0-377-mem3008mb-disk10240mb-600sec';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lambdaPayload, pendingRenderId, userId, progressId } = await req.json();

    if (!lambdaPayload || !pendingRenderId || !userId) {
      return new Response(
        JSON.stringify({ error: 'lambdaPayload, pendingRenderId, and userId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🚀 invoke-remotion-render: Starting for renderId=${pendingRenderId}, userId=${userId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Initialize AWS client
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region: AWS_REGION,
    });

    const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;

    // ASCII-safe JSON encoding for Umlaute
    const rawJson = JSON.stringify(lambdaPayload);
    const asciiSafeJson = rawJson.replace(/[\u0080-\uffff]/g, (char) => {
      const hex = char.charCodeAt(0).toString(16).padStart(4, '0');
      return String.fromCharCode(92) + 'u' + hex;
    });

    // ✅ RequestResponse mode — identical to Director's Cut pattern
    // Fresh wall_clock budget, so no timeout issues
    console.log('🚀 Invoking Lambda in RequestResponse mode...');

    const lambdaResponse = await aws.fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Invocation-Type': 'RequestResponse',
      },
      body: asciiSafeJson,
    });

    console.log('📥 Lambda response status:', lambdaResponse.status);

    if (!lambdaResponse.ok) {
      const errorText = await lambdaResponse.text();
      console.error('❌ Lambda invocation failed:', lambdaResponse.status, errorText);

      // Update DB with failure
      await supabase.from('video_renders').update({
        status: 'failed',
        error_message: `Lambda HTTP ${lambdaResponse.status}: ${errorText.substring(0, 500)}`,
        completed_at: new Date().toISOString(),
      }).eq('render_id', pendingRenderId);

      if (progressId) {
        await supabase.from('universal_video_progress').update({
          current_step: 'failed',
          status: 'failed',
          progress_percent: 0,
          status_message: `Lambda-Fehler: ${errorText.substring(0, 200)}`,
          updated_at: new Date().toISOString(),
        }).eq('id', progressId);
      }

      return new Response(
        JSON.stringify({ error: `Lambda failed: ${errorText.substring(0, 200)}`, retryable: lambdaResponse.status === 429 }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await lambdaResponse.json();
    console.log('📥 Lambda result:', JSON.stringify(result));

    // Check for Lambda function errors
    if (result.errorMessage || result.errorType) {
      console.error('❌ Lambda function error:', result);

      await supabase.from('video_renders').update({
        status: 'failed',
        error_message: result.errorMessage || 'Lambda function error',
        completed_at: new Date().toISOString(),
      }).eq('render_id', pendingRenderId);

      if (progressId) {
        await supabase.from('universal_video_progress').update({
          current_step: 'failed',
          status: 'failed',
          progress_percent: 0,
          status_message: `Lambda-Fehler: ${(result.errorMessage || 'Unknown error').substring(0, 200)}`,
          updated_at: new Date().toISOString(),
        }).eq('id', progressId);
      }

      return new Response(
        JSON.stringify({ error: result.errorMessage || 'Lambda function error' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ Success! Extract the real renderId from Lambda
    const realRenderId = result.renderId;
    const bucketName = result.bucketName;
    console.log(`✅ Lambda returned realRenderId=${realRenderId}, bucketName=${bucketName}`);

    // Update video_renders with the real renderId
    if (realRenderId && realRenderId !== pendingRenderId) {
      console.log(`📝 Updating video_renders: render_id ${pendingRenderId} → ${realRenderId}`);
      await supabase.from('video_renders').update({
        render_id: realRenderId,
        status: 'rendering',
      }).eq('render_id', pendingRenderId);
    }

    // Update progress with the real renderId
    if (progressId) {
      await supabase.from('universal_video_progress').update({
        current_step: 'rendering',
        progress_percent: 90,
        status_message: '🎬 Video wird gerendert...',
        result_data: { renderId: realRenderId || pendingRenderId, bucketName },
        updated_at: new Date().toISOString(),
      }).eq('id', progressId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        renderId: realRenderId || pendingRenderId,
        bucketName: bucketName || 'remotionlambda-eucentral1-13gm4o6s90',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ invoke-remotion-render error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
