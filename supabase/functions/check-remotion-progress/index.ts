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
const DEFAULT_BUCKET_NAME = 'remotionlambda-eucentral1-13gm4o6s90';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Check Remotion progress request received');
    
    const { render_id, renderId, source } = await req.json();
    
    const effectiveRenderId = render_id || renderId;
    
    if (!effectiveRenderId) {
      throw new Error('render_id is required');
    }

    console.log('📊 Checking progress for render:', effectiveRenderId, 'source:', source);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ============================================
    // ✅ FIRST: Check DB for completed/failed status
    // ============================================
    
    const isDirectorsCut = source === 'directors-cut';
    const tableName = isDirectorsCut ? 'director_cut_renders' : 'video_renders';
    const renderIdColumn = isDirectorsCut ? 'remotion_render_id' : 'render_id';
    const outputColumn = isDirectorsCut ? 'output_url' : 'video_url';

    const { data: renderData, error: renderError } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .eq(renderIdColumn, effectiveRenderId)
      .maybeSingle();

    if (renderError) {
      console.error('DB query error:', renderError);
    }

    // If already completed in DB
    if (renderData?.status === 'completed' && renderData[outputColumn]) {
      console.log('✅ Render completed (from DB)');
      return new Response(
        JSON.stringify({
          success: true,
          render_id: effectiveRenderId,
          done: true,
          fatalErrorEncountered: false,
          outputFile: renderData[outputColumn],
          errors: null,
          overallProgress: 1,
          status: 'completed',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If failed in DB
    if (renderData?.status === 'failed') {
      console.log('❌ Render failed (from DB)');
      return new Response(
        JSON.stringify({
          success: true,
          render_id: effectiveRenderId,
          done: false,
          fatalErrorEncountered: true,
          outputFile: null,
          errors: [renderData.error_message || 'Render failed'],
          overallProgress: 0,
          status: 'failed',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize AWS client
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region: AWS_REGION,
    });

    const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;

    // ============================================
    // ✅ REAL RENDER ID: Query AWS directly
    // ============================================
    
    if (!effectiveRenderId.startsWith('pending-')) {
      console.log('🎯 Real renderId detected, querying AWS directly...');
      
      try {
        const progressPayload = {
          type: 'status',
          bucketName: DEFAULT_BUCKET_NAME,
          renderId: effectiveRenderId,
        };

        console.log('📤 Sending status request to Lambda:', JSON.stringify(progressPayload));

        const lambdaResponse = await aws.fetch(lambdaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(progressPayload),
        });

        if (lambdaResponse.status === 200) {
          const awsStatus = await lambdaResponse.json();
          console.log('📥 AWS Status response:', JSON.stringify(awsStatus));

          // Check if done
          if (awsStatus.done === true) {
            const outputFile = awsStatus.outputFile || awsStatus.url;
            console.log('✅ AWS reports render DONE! URL:', outputFile);

            if (outputFile) {
              await supabaseAdmin
                .from(tableName)
                .update({
                  status: 'completed',
                  [outputColumn]: outputFile,
                  completed_at: new Date().toISOString(),
                })
                .eq(renderIdColumn, effectiveRenderId);
              
              console.log('✅ DB updated with completed status');
            }

            return new Response(
              JSON.stringify({
                success: true,
                render_id: effectiveRenderId,
                done: true,
                fatalErrorEncountered: false,
                outputFile: outputFile,
                errors: null,
                overallProgress: 1,
                status: 'completed',
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Check for fatal error
          if (awsStatus.fatalErrorEncountered) {
            console.log('❌ AWS reports fatal error:', awsStatus.errors);
            
            await supabaseAdmin
              .from(tableName)
              .update({
                status: 'failed',
                error_message: JSON.stringify(awsStatus.errors || 'Unknown AWS error'),
              })
              .eq(renderIdColumn, effectiveRenderId);

            return new Response(
              JSON.stringify({
                success: true,
                render_id: effectiveRenderId,
                done: false,
                fatalErrorEncountered: true,
                outputFile: null,
                errors: awsStatus.errors || ['Unknown error'],
                overallProgress: 0,
                status: 'failed',
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Still rendering - return real progress from AWS
          const realProgress = awsStatus.overallProgress || 0;
          console.log(`📊 AWS real progress: ${Math.round(realProgress * 100)}%`);

          return new Response(
            JSON.stringify({
              success: true,
              render_id: effectiveRenderId,
              done: false,
              fatalErrorEncountered: false,
              outputFile: null,
              errors: null,
              overallProgress: realProgress,
              status: 'rendering',
              message: `Rendering... (${Math.round(realProgress * 100)}%)`,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          console.error('❌ Lambda status query failed:', lambdaResponse.status);
        }
      } catch (awsError) {
        console.error('❌ AWS query error:', awsError);
      }
    }

    // ============================================
    // ✅ PENDING IDs: Time-based progress + S3 check
    // ============================================
    
    console.log('📊 Using time-based progress + S3 check');
    const createdAt = renderData?.created_at ? new Date(renderData.created_at).getTime() : Date.now();
    const elapsedSeconds = (Date.now() - createdAt) / 1000;
    
    // Progress: 10% to 90% over 3 minutes (180 seconds)
    const progressRatio = Math.min(elapsedSeconds / 180, 1);
    const simulatedProgress = 0.1 + 0.8 * progressRatio;
    
    // Try to find the video on S3 using outName
    const outName = renderData?.format_config?.out_name;
    if (outName && elapsedSeconds > 30) {
      try {
        console.log('🔍 Checking S3 for completed video:', outName);
        
        // List objects in S3 bucket - Remotion stores in renders/{renderId}/out.mp4 format
        const s3ListUrl = `https://s3.${AWS_REGION}.amazonaws.com/${DEFAULT_BUCKET_NAME}?list-type=2&prefix=renders/&max-keys=100`;
        
        const listResponse = await aws.fetch(s3ListUrl, { method: 'GET' });
        
        if (listResponse.ok) {
          const xmlText = await listResponse.text();
          
          // Look for our specific outName in any folder
          const baseFileName = outName.replace('.mp4', '');
          
          // Match pattern: renders/{renderId}/{outName}.mp4
          const keyRegex = new RegExp(`<Key>(renders/[^/]+/${baseFileName}[^<]*\\.mp4)</Key>`, 'g');
          const matches = [...xmlText.matchAll(keyRegex)];
          
          if (matches.length > 0) {
            const fullKey = matches[0][1];
            const s3Url = `https://${DEFAULT_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${fullKey}`;
            console.log('✅ Video found on S3:', s3Url);
            
            // Update DB with completed status
            await supabaseAdmin
              .from('video_renders')
              .update({
                status: 'completed',
                video_url: s3Url,
                completed_at: new Date().toISOString(),
              })
              .eq('render_id', effectiveRenderId);
            
            return new Response(
              JSON.stringify({
                success: true,
                render_id: effectiveRenderId,
                done: true,
                fatalErrorEncountered: false,
                outputFile: s3Url,
                errors: null,
                overallProgress: 1,
                status: 'completed',
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          // Log recent files for debugging
          const recentRegex = /<Key>(renders\/[^<]+\.mp4)<\/Key>[\s\S]*?<LastModified>([^<]+)<\/LastModified>/g;
          const recentMatches = [...xmlText.matchAll(recentRegex)];
          const recentFiles = recentMatches
            .map(m => ({ key: m[1], modified: new Date(m[2]) }))
            .filter(f => (Date.now() - f.modified.getTime()) < 300000) // Last 5 min
            .slice(0, 5);
          
          if (recentFiles.length > 0) {
            console.log('📦 Recent S3 files:', JSON.stringify(recentFiles.map(f => f.key)));
          }
        }
      } catch (s3Error) {
        console.log('⚠️ S3 check failed:', s3Error);
      }
    }
    
    // If over 6 minutes and still no video, something might be wrong
    if (elapsedSeconds > 360) {
      console.log('⚠️ Render taking too long (>6 min)');
      return new Response(
        JSON.stringify({
          success: true,
          render_id: effectiveRenderId,
          done: false,
          fatalErrorEncountered: false,
          outputFile: null,
          errors: null,
          overallProgress: 0.98,
          status: 'rendering',
          message: 'Rendering dauert länger als erwartet...',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Video not ready yet, return simulated progress
    return new Response(
      JSON.stringify({
        success: true,
        render_id: effectiveRenderId,
        done: false,
        fatalErrorEncountered: false,
        outputFile: null,
        errors: null,
        overallProgress: Math.min(simulatedProgress, 0.95),
        status: 'rendering',
        message: `Rendering... (${Math.round(simulatedProgress * 100)}%)`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
