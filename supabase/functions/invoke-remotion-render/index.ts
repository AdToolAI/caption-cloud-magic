import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AWS_REGION = 'eu-central-1';
const LAMBDA_FUNCTION_NAME = 'remotion-render-4-0-377-mem3008mb-disk10240mb-600sec';

// AWS Event mode payload limit is 256 KB
const MAX_EVENT_PAYLOAD_BYTES = 256 * 1024;

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

    // ✅ IDEMPOTENZ-CHECK: Wurde diese renderId bereits gestartet?
    const { data: existingRender } = await supabase
      .from('video_renders')
      .select('status, content_config')
      .eq('render_id', pendingRenderId)
      .maybeSingle();

    // Already started or completed? Return no-op
    if (existingRender?.content_config && (existingRender.content_config as any).lambda_render_id) {
      const existingLambdaId = (existingRender.content_config as any).lambda_render_id;
      console.log(`⏭️ Already started: lambda_render_id=${existingLambdaId}, returning no-op`);
      return new Response(
        JSON.stringify({
          success: true,
          renderId: pendingRenderId,
          lambdaRenderId: existingLambdaId,
          bucketName: 'remotionlambda-eucentral1-13gm4o6s90',
          alreadyStarted: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existingRender?.status === 'rendering' || existingRender?.status === 'completed') {
      console.log(`⏭️ Render already in status=${existingRender.status}, returning no-op`);
      return new Response(
        JSON.stringify({
          success: true,
          renderId: pendingRenderId,
          alreadyStarted: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ Payload size guard for Event mode (256KB limit)
    const rawJson = JSON.stringify(lambdaPayload);
    const payloadBytes = new TextEncoder().encode(rawJson).length;
    console.log(`📦 Payload size: ${payloadBytes} bytes (limit: ${MAX_EVENT_PAYLOAD_BYTES})`);

    if (payloadBytes > MAX_EVENT_PAYLOAD_BYTES) {
      console.error(`❌ Payload too large for Event mode: ${payloadBytes} > ${MAX_EVENT_PAYLOAD_BYTES}`);
      return new Response(
        JSON.stringify({ 
          error: `Lambda-Payload zu groß (${Math.round(payloadBytes / 1024)}KB > ${MAX_EVENT_PAYLOAD_BYTES / 1024}KB). Bitte reduziere die Anzahl der Szenen.`,
          payloadSize: payloadBytes,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ Update DB status BEFORE Lambda call (optimistic)
    const { data: renderRow } = await supabase
      .from('video_renders')
      .select('content_config')
      .eq('render_id', pendingRenderId)
      .maybeSingle();

    const existingConfig = renderRow?.content_config || {};
    const bucketName = lambdaPayload?.bucketName || 'remotionlambda-eucentral1-13gm4o6s90';
    const outName = lambdaPayload?.outName || null;

    await supabase.from('video_renders').update({
      status: 'rendering',
      bucket_name: bucketName,
      content_config: {
        ...existingConfig,
        lambda_invoked_at: new Date().toISOString(),
        lambda_render_id: pendingRenderId,
        bucket_name: bucketName,
        out_name: outName,
      },
    }).eq('render_id', pendingRenderId);

    if (progressId) {
      // Preserve existing result_data (lambdaPayload, assets etc.)
      const { data: progressRow } = await supabase
        .from('universal_video_progress')
        .select('result_data')
        .eq('id', progressId)
        .maybeSingle();
      
      const existingResultData = (progressRow?.result_data as any) || {};
      
      await supabase.from('universal_video_progress').update({
        current_step: 'rendering',
        progress_percent: 90,
        status_message: '🎬 Video wird gerendert...',
        result_data: { 
          ...existingResultData,
          renderId: pendingRenderId,
          bucketName,
          lambda_render_id: pendingRenderId,
        },
        updated_at: new Date().toISOString(),
      }).eq('id', progressId);
    }

    console.log('📝 DB updated to rendering status');

    // ✅ Initialize AWS client
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region: AWS_REGION,
    });

    const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;

    // ASCII-safe JSON encoding for Umlaute
    const asciiSafeJson = rawJson.replace(/[\u0080-\uffff]/g, (char) => {
      const hex = char.charCodeAt(0).toString(16).padStart(4, '0');
      return String.fromCharCode(92) + 'u' + hex;
    });

    // ✅ Event mode — fire-and-forget, returns immediately (HTTP 202)
    console.log('🚀 Invoking Lambda in Event mode (async, no wait)...');

    const lambdaResponse = await aws.fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Invocation-Type': 'Event',
      },
      body: asciiSafeJson,
    });

    console.log('📥 Lambda Event response status:', lambdaResponse.status);

    // Event mode returns 202 on success
    if (lambdaResponse.status !== 202 && !lambdaResponse.ok) {
      const errorText = await lambdaResponse.text();
      console.error('❌ Lambda Event invocation failed:', lambdaResponse.status, errorText);

      // Revert DB status
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

    // ✅ Success! Lambda accepted the job asynchronously
    console.log(`✅ Lambda accepted render job for pendingRenderId=${pendingRenderId}`);

    // ✅ Persist tracking reference AFTER successful invocation
    await supabase.from('video_renders').update({
      content_config: {
        ...existingConfig,
        lambda_invoked_at: new Date().toISOString(),
        lambda_render_id: pendingRenderId,
        bucket_name: bucketName,
        out_name: outName,
        lambda_accepted: true,
      },
    }).eq('render_id', pendingRenderId);

    return new Response(
      JSON.stringify({
        success: true,
        renderId: pendingRenderId,
        lambdaRenderId: pendingRenderId,
        bucketName,
        async: true,
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
