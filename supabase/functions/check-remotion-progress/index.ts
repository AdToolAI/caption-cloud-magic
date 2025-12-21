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

// Timeout: If no video found after 8 minutes, mark as failed
const RENDER_TIMEOUT_SECONDS = 480;

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

    // Initialize AWS client
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region: AWS_REGION,
    });

    const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;

    // ============================================
    // ✅ STEP 1: Check DB for current status
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

    const createdAt = renderData?.created_at ? new Date(renderData.created_at).getTime() : Date.now();
    const elapsedSeconds = (Date.now() - createdAt) / 1000;

    // ============================================
    // ✅ TIMEOUT CHECK: Mark as failed after 8 minutes
    // ============================================
    
    if (elapsedSeconds > RENDER_TIMEOUT_SECONDS) {
      console.log(`⏰ TIMEOUT: Render exceeded ${RENDER_TIMEOUT_SECONDS}s, marking as failed`);
      
      // Mark as failed in DB
      await supabaseAdmin
        .from(tableName)
        .update({
          status: 'failed',
          error_message: 'Render timeout - Video konnte nicht innerhalb von 8 Minuten erstellt werden',
        })
        .eq(renderIdColumn, effectiveRenderId);
      
      // Refund credits if applicable
      if (renderData?.content_config?.credits_used && renderData?.user_id) {
        const creditsToRefund = renderData.content_config.credits_used;
        
        try {
          await supabaseAdmin.rpc('increment_balance', {
            p_user_id: renderData.user_id,
            p_amount: creditsToRefund
          });
          console.log(`💰 Refunded ${creditsToRefund} credits to user ${renderData.user_id}`);
        } catch (refundError) {
          console.error('Failed to refund credits:', refundError);
        }
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          render_id: effectiveRenderId,
          done: false,
          fatalErrorEncountered: true,
          outputFile: null,
          errors: ['Render timeout - Video konnte nicht erstellt werden. Credits wurden erstattet.'],
          overallProgress: 0,
          status: 'failed',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // ✅ STEP 2: Check if this is a pending ID (legacy)
    // New renders should have real renderIds directly
    // ============================================
    
    if (effectiveRenderId.startsWith('pending-')) {
      console.log('⚠️ Legacy pending ID detected - showing simulated progress');
      
      // For old pending IDs, show simulated progress until timeout
      const simulatedProgress = Math.min(0.15 + (elapsedSeconds / 300) * 0.75, 0.92);
      
      return new Response(
        JSON.stringify({
          success: true,
          render_id: effectiveRenderId,
          done: false,
          fatalErrorEncountered: false,
          outputFile: null,
          errors: null,
          overallProgress: simulatedProgress,
          status: 'rendering',
          message: 'Video wird gerendert...',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // ✅ STEP 3: Query AWS Lambda for real progress
    // This is the clean path - we have a real renderId
    // ============================================
    
    console.log('🎯 Real renderId detected, querying AWS for status...');
    
    const progressPayload = {
      type: 'status',
      bucketName: renderData?.bucket_name || DEFAULT_BUCKET_NAME,
      renderId: effectiveRenderId,
    };

    console.log('📤 Sending status request to Lambda:', JSON.stringify(progressPayload));

    try {
      const lambdaResponse = await aws.fetch(lambdaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(progressPayload),
      });

      console.log('📥 Lambda status response:', lambdaResponse.status);

      if (lambdaResponse.status === 200) {
        const awsStatus = await lambdaResponse.json();
        console.log('📥 AWS Status:', JSON.stringify(awsStatus, null, 2));

        // Check for Lambda error response
        if (awsStatus.type === 'error' || awsStatus.errorMessage) {
          console.error('❌ AWS returned error:', awsStatus);
          
          await supabaseAdmin
            .from(tableName)
            .update({
              status: 'failed',
              error_message: awsStatus.message || awsStatus.errorMessage || 'Unknown AWS error',
            })
            .eq(renderIdColumn, effectiveRenderId);

          // Refund credits
          if (renderData?.content_config?.credits_used && renderData?.user_id) {
            try {
              await supabaseAdmin.rpc('increment_balance', {
                p_user_id: renderData.user_id,
                p_amount: renderData.content_config.credits_used
              });
              console.log(`💰 Refunded credits due to AWS error`);
            } catch (e) {
              console.error('Refund failed:', e);
            }
          }

          return new Response(
            JSON.stringify({
              success: true,
              render_id: effectiveRenderId,
              done: false,
              fatalErrorEncountered: true,
              outputFile: null,
              errors: [awsStatus.message || awsStatus.errorMessage || 'Rendering failed'],
              overallProgress: 0,
              status: 'failed',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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

          // Refund credits
          if (renderData?.content_config?.credits_used && renderData?.user_id) {
            try {
              await supabaseAdmin.rpc('increment_balance', {
                p_user_id: renderData.user_id,
                p_amount: renderData.content_config.credits_used
              });
              console.log(`💰 Refunded credits due to fatal error`);
            } catch (e) {
              console.error('Refund failed:', e);
            }
          }

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

        // Calculate meaningful progress message
        let progressMessage = 'Rendering...';
        if (realProgress < 0.1) {
          progressMessage = 'Rendering wird initialisiert...';
        } else if (realProgress < 0.3) {
          progressMessage = 'Szenen werden zusammengestellt...';
        } else if (realProgress < 0.6) {
          progressMessage = 'Video wird gerendert...';
        } else if (realProgress < 0.9) {
          progressMessage = 'Video wird finalisiert...';
        } else {
          progressMessage = 'Fast fertig...';
        }

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
            message: `${progressMessage} (${Math.round(realProgress * 100)}%)`,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.error('❌ Lambda status query failed with status:', lambdaResponse.status);
        const errorText = await lambdaResponse.text();
        console.error('❌ Error body:', errorText);
      }
    } catch (awsError) {
      console.error('❌ AWS query error:', awsError);
    }

    // ============================================
    // ✅ FALLBACK: If AWS query fails, show time-based progress
    // ============================================
    
    console.log('⚠️ AWS query failed, showing time-based progress');
    
    // Calculate fallback progress based on elapsed time (typical render: 2-3 min)
    const fallbackProgress = Math.min(0.15 + (elapsedSeconds / 180) * 0.75, 0.92);
    
    return new Response(
      JSON.stringify({
        success: true,
        render_id: effectiveRenderId,
        done: false,
        fatalErrorEncountered: false,
        outputFile: null,
        errors: null,
        overallProgress: fallbackProgress,
        status: 'rendering',
        message: 'Video wird gerendert...',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-remotion-progress:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
