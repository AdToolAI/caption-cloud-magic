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
    // Webhook might have already updated it
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

    // If already completed in DB (webhook worked)
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

    // ============================================
    // ✅ QUERY AWS LAMBDA FOR REAL PROGRESS
    // This works for real renderIds (not pending-)
    // ============================================
    
    // Skip AWS query for pending- IDs (legacy, should not happen anymore)
    if (effectiveRenderId.startsWith('pending-')) {
      console.log('⚠️ Legacy pending- ID detected, using time-based progress');
      const startedAt = renderData?.started_at ? new Date(renderData.started_at).getTime() : Date.now();
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const progressRatio = Math.min(elapsedSeconds / 180, 1);
      const simulatedProgress = 0.1 + 0.8 * (1 - Math.exp(-3 * progressRatio));
      
      return new Response(
        JSON.stringify({
          success: true,
          render_id: effectiveRenderId,
          done: false,
          fatalErrorEncountered: false,
          outputFile: null,
          errors: null,
          overallProgress: Math.min(simulatedProgress, 0.9),
          status: 'rendering',
          message: `Rendering... (${Math.round(simulatedProgress * 100)}%)`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ Query AWS Lambda for real progress
    console.log('🔄 Querying AWS Lambda for real progress...');
    
    try {
      const aws = new AwsClient({
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
        region: AWS_REGION,
      });

      const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;

      const progressPayload = {
        type: 'status',
        bucketName: DEFAULT_BUCKET_NAME,
        renderId: effectiveRenderId,
      };

      console.log('📤 Sending status request to Lambda:', JSON.stringify(progressPayload));

      const lambdaResponse = await aws.fetch(lambdaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(progressPayload),
      });

      if (lambdaResponse.status !== 200) {
        console.error('❌ Lambda status query failed:', lambdaResponse.status);
        throw new Error(`Lambda status failed: ${lambdaResponse.status}`);
      }

      const awsStatus = await lambdaResponse.json();
      console.log('📥 AWS Status response:', JSON.stringify(awsStatus));

      // Check if done
      if (awsStatus.done === true) {
        const outputFile = awsStatus.outputFile || awsStatus.url;
        console.log('✅ AWS reports render DONE! URL:', outputFile);

        // Update DB with completed status
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
        
        // Update DB with failed status
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

    } catch (awsError) {
      console.error('❌ AWS query error:', awsError);
      
      // Fallback to time-based progress if AWS query fails
      const startedAt = renderData?.started_at || renderData?.created_at;
      const startTime = startedAt ? new Date(startedAt).getTime() : Date.now();
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const progressRatio = Math.min(elapsedSeconds / 180, 1);
      const simulatedProgress = 0.1 + 0.8 * (1 - Math.exp(-3 * progressRatio));
      
      console.log(`⚠️ Fallback to time-based progress: ${Math.round(simulatedProgress * 100)}%`);

      return new Response(
        JSON.stringify({
          success: true,
          render_id: effectiveRenderId,
          done: false,
          fatalErrorEncountered: false,
          outputFile: null,
          errors: null,
          overallProgress: Math.min(simulatedProgress, 0.9),
          status: 'rendering',
          message: `Rendering... (${Math.round(simulatedProgress * 100)}%)`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
