import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";
import { getLambdaFunctionName, AWS_REGION, DEFAULT_BUCKET_NAME } from "../_shared/aws-lambda.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { trackId, audioUrl, mode = 'smoke-test' } = await req.json();

    // If trackId provided, look up the URL
    let testUrl = audioUrl;
    let trackRecord: any = null;
    
    if (trackId && !testUrl) {
      const { data: track } = await supabase
        .from('background_music_tracks')
        .select('*')
        .eq('id', trackId)
        .single();
      
      if (!track) {
        return new Response(JSON.stringify({ error: 'Track not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      trackRecord = track;
      const { data: urlData } = supabase.storage
        .from('background-music')
        .getPublicUrl(track.storage_path);
      testUrl = urlData?.publicUrl;
    }

    if (!testUrl) {
      return new Response(JSON.stringify({ error: 'audioUrl or trackId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[validate-music-track] Testing: ${testUrl}`);
    console.log(`[validate-music-track] Mode: ${mode}`);

    // Step 1: Basic reachability check
    const headResp = await fetch(testUrl, { method: 'HEAD' });
    const reachability = {
      status: headResp.status,
      contentType: headResp.headers.get('content-type'),
      contentLength: headResp.headers.get('content-length'),
      ok: headResp.ok,
    };
    console.log(`[validate-music-track] Reachability:`, JSON.stringify(reachability));

    if (!headResp.ok) {
      const result = { 
        status: 'failed', 
        reason: 'not_reachable', 
        reachability,
        audioUrl: testUrl 
      };
      
      if (trackId) {
        await supabase.from('background_music_tracks').update({
          validation_status: 'failed',
          validation_error: `HTTP ${headResp.status}`,
          validation_attempts: (trackRecord?.validation_attempts || 0) + 1,
        }).eq('id', trackId);
      }
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (mode === 'reachability-only') {
      return new Response(JSON.stringify({ status: 'reachable', reachability, audioUrl: testUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 2: Lambda smoke test via AudioSmokeTest composition
    const REMOTION_SERVE_URL = Deno.env.get('REMOTION_SERVE_URL');
    if (!REMOTION_SERVE_URL) {
      return new Response(JSON.stringify({ error: 'REMOTION_SERVE_URL not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region: AWS_REGION,
    });

    const functionName = getLambdaFunctionName();
    const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${functionName}/invocations`;

    // Minimal 2-second render with just the audio
    const inputProps = {
      audioUrl: testUrl,
    };

    const lambdaPayload = {
      type: 'start',
      serveUrl: REMOTION_SERVE_URL,
      composition: 'AudioSmokeTest',
      inputProps: {
        type: 'payload',
        payload: JSON.stringify(inputProps),
      },
      codec: 'h264',
      audioCodec: 'aac',
      imageFormat: 'jpeg',
      durationInFrames: 60, // 2 seconds at 30fps
      fps: 30,
      height: 720,
      width: 1280,
      frameRange: [0, 59],
      framesPerLambda: 60,
      maxRetries: 0,
      privacy: 'no-acl',
      logLevel: 'info',
      outName: `smoke-test-${Date.now()}.mp4`,
      timeoutInMilliseconds: 120000,
      chromiumOptions: {},
      envVariables: {},
      forceHeight: null,
      forceWidth: null,
      rendererFunctionName: null,
      bucketName: DEFAULT_BUCKET_NAME,
      concurrencyPerLambda: 1,
      muted: false, // We WANT audio to be processed
      overwrite: true,
      webhook: null,
      forcePathStyle: false,
      x264Preset: 'ultrafast',
      jpegQuality: 50,
      everyNthFrame: 1,
      downloadBehavior: { type: 'play-in-browser' },
    };

    console.log(`[validate-music-track] Invoking Lambda smoke test...`);
    console.log(`[validate-music-track] Composition: AudioSmokeTest`);
    console.log(`[validate-music-track] audioUrl: ${testUrl.substring(0, 80)}...`);

    const lambdaResponse = await aws.fetch(lambdaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lambdaPayload),
    });

    const lambdaResult = await lambdaResponse.json();
    console.log(`[validate-music-track] Lambda response type: ${lambdaResult?.type}`);

    let validationResult: any = {
      audioUrl: testUrl,
      trackId: trackId || null,
      reachability,
      lambdaResponseType: lambdaResult?.type,
    };

    if (lambdaResult?.type === 'error') {
      const errorMessage = lambdaResult?.message || lambdaResult?.errorMessage || 'Unknown Lambda error';
      console.error(`[validate-music-track] ❌ Lambda error: ${errorMessage}`);
      
      const isAudioCorruption = /ffprobe|mpeg audio|invalid data/i.test(errorMessage);
      
      validationResult.status = 'failed';
      validationResult.reason = isAudioCorruption ? 'audio_corruption' : 'lambda_error';
      validationResult.error = errorMessage;
      
      if (trackId) {
        await supabase.from('background_music_tracks').update({
          validation_status: 'failed',
          validation_error: errorMessage.substring(0, 500),
          validation_attempts: (trackRecord?.validation_attempts || 0) + 1,
          last_validated_at: new Date().toISOString(),
        }).eq('id', trackId);
      }
    } else if (lambdaResult?.renderId) {
      console.log(`[validate-music-track] ✅ Lambda render started: ${lambdaResult.renderId}`);
      
      validationResult.status = 'validated';
      validationResult.renderId = lambdaResult.renderId;
      validationResult.reason = 'lambda_accepted';
      
      if (trackId) {
        await supabase.from('background_music_tracks').update({
          validation_status: 'validated',
          validation_error: null,
          validation_attempts: (trackRecord?.validation_attempts || 0) + 1,
          last_validated_at: new Date().toISOString(),
          is_valid: true,
        }).eq('id', trackId);
      }
    } else {
      console.warn(`[validate-music-track] ⚠️ Unexpected Lambda response:`, JSON.stringify(lambdaResult).substring(0, 500));
      
      validationResult.status = 'unknown';
      validationResult.reason = 'unexpected_response';
      validationResult.lambdaResult = JSON.stringify(lambdaResult).substring(0, 1000);
    }

    return new Response(JSON.stringify(validationResult, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[validate-music-track] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
