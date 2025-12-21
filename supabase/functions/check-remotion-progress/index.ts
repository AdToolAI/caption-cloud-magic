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
          progress: {
            done: true,
            fatalErrorEncountered: false,
            outputFile: renderData[outputColumn],
            errors: null,
            overallProgress: 1,
          },
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
          progress: {
            done: false,
            fatalErrorEncountered: true,
            outputFile: null,
            errors: [renderData.error_message || 'Render failed'],
            overallProgress: 0,
          },
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
          progress: {
            done: false,
            fatalErrorEncountered: true,
            outputFile: null,
            errors: ['Render timeout - Video konnte nicht erstellt werden. Credits wurden erstattet.'],
            overallProgress: 0,
          },
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
          progress: {
            done: false,
            fatalErrorEncountered: false,
            outputFile: null,
            errors: null,
            overallProgress: simulatedProgress,
          },
          status: 'rendering',
          message: 'Video wird gerendert...',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // ✅ STEP 3: Check S3 directly for video completion
    // Lambda `type: 'status'` is not a valid handler, so we check S3 directly
    // ============================================
    
    console.log('🎯 Real renderId detected, checking S3 for video status...');
    
    const bucketName = renderData?.bucket_name || DEFAULT_BUCKET_NAME;
    
    // S3 path for completed video: renders/{renderId}/out.mp4
    const videoKey = `renders/${effectiveRenderId}/out.mp4`;
    const s3VideoUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/${videoKey}`;
    
    console.log('🔍 Checking S3 for completed video:', s3VideoUrl);
    
    try {
      // Use HEAD request to check if video exists (faster than GET)
      const headResponse = await aws.fetch(s3VideoUrl, { 
        method: 'HEAD',
      });
      
      console.log('📥 S3 HEAD response:', headResponse.status);
      
      if (headResponse.ok) {
        // ✅ Video is DONE! 
        console.log('✅ Video found on S3! Render complete.');
        
        // Update DB with completed status
        await supabaseAdmin
          .from(tableName)
          .update({
            status: 'completed',
            [outputColumn]: s3VideoUrl,
            completed_at: new Date().toISOString(),
          })
          .eq(renderIdColumn, effectiveRenderId);
        
        console.log('✅ DB updated with completed status');
        
        // ============================================
        // ✅ SAVE TO MEDIA LIBRARY (video_creations)
        // ============================================
        if (renderData?.user_id) {
          console.log('📚 Saving video to Media Library...');
          
          // Check if already exists
          const { data: existingVideo } = await supabaseAdmin
            .from('video_creations')
            .select('id')
            .eq('output_url', s3VideoUrl)
            .maybeSingle();
          
          if (!existingVideo) {
            const { error: insertError } = await supabaseAdmin
              .from('video_creations')
              .insert({
                user_id: renderData.user_id,
                output_url: s3VideoUrl,
                status: 'completed',
                metadata: {
                  source: 'universal-creator',
                  render_id: effectiveRenderId,
                  format_config: renderData.format_config,
                  content_config: renderData.content_config,
                  project_id: renderData.project_id,
                  bucket_name: bucketName,
                }
              });
            
            if (insertError) {
              console.error('❌ Failed to save to Media Library:', insertError);
            } else {
              console.log('✅ Video saved to Media Library');
            }
          } else {
            console.log('ℹ️ Video already exists in Media Library');
          }
          
          // Also save to media_assets for broader compatibility
          const { data: existingAsset } = await supabaseAdmin
            .from('media_assets')
            .select('id')
            .eq('original_url', s3VideoUrl)
            .maybeSingle();
          
          if (!existingAsset) {
            await supabaseAdmin
              .from('media_assets')
              .insert({
                user_id: renderData.user_id,
                type: 'video',
                original_url: s3VideoUrl,
                storage_path: s3VideoUrl,
                source: 'remotion-render',
              });
            console.log('✅ Video saved to media_assets');
          }
        }
        
        // Update project status if applicable
        if (renderData?.project_id) {
          await supabaseAdmin
            .from('content_projects')
            .update({ status: 'completed' })
            .eq('id', renderData.project_id);
          console.log('✅ Project status updated to completed');
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            render_id: effectiveRenderId,
            progress: {
              done: true,
              fatalErrorEncountered: false,
              outputFile: s3VideoUrl,
              errors: null,
              overallProgress: 1,
            },
            status: 'completed',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Video not found yet - check for chunks to estimate progress
      console.log('📦 Video not ready yet, checking chunks for progress...');
      
    } catch (s3Error) {
      console.error('❌ S3 check error:', s3Error);
    }
    
    // ============================================
    // ✅ STEP 4: Get real progress from Remotion Lambda
    // Use type: 'progress' which maps to getRenderProgress handler
    // ============================================
    
    let estimatedProgress = 0.15; // Default starting progress
    let progressSource = 'default';
    
    // APPROACH 1: Call Lambda with type: 'progress' 
    try {
      console.log('🎯 Calling Lambda with type: progress...');
      
      const progressPayload = {
        type: 'progress',
        version: '4.0.377',
        bucketName: bucketName,
        renderId: effectiveRenderId,
      };
      
      const lambdaResponse = await aws.fetch(lambdaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(progressPayload),
      });
      
      console.log('📥 Lambda progress response status:', lambdaResponse.status);
      
      if (lambdaResponse.ok) {
        const responseText = await lambdaResponse.text();
        console.log('📥 Lambda progress response (first 500 chars):', responseText.substring(0, 500));
        
        try {
          const progressData = JSON.parse(responseText);
          
          // Check if we got actual progress data
          if (typeof progressData.overallProgress === 'number') {
            estimatedProgress = progressData.overallProgress;
            progressSource = 'lambda';
            console.log(`✅ Lambda returned progress: ${Math.round(estimatedProgress * 100)}%`);
            
            // Check if done
            if (progressData.done && progressData.outputFile) {
              console.log('✅ Lambda reports render done!');
              
              // Update DB
              await supabaseAdmin
                .from(tableName)
                .update({
                  status: 'completed',
                  [outputColumn]: progressData.outputFile,
                  completed_at: new Date().toISOString(),
                })
                .eq(renderIdColumn, effectiveRenderId);
              
              return new Response(
                JSON.stringify({
                  success: true,
                  render_id: effectiveRenderId,
                  progress: {
                    done: true,
                    fatalErrorEncountered: false,
                    outputFile: progressData.outputFile,
                    errors: null,
                    overallProgress: 1,
                  },
                  status: 'completed',
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            
            // Check for fatal error
            if (progressData.fatalErrorEncountered) {
              console.log('❌ Lambda reports fatal error');
              return new Response(
                JSON.stringify({
                  success: true,
                  render_id: effectiveRenderId,
                  progress: {
                    done: false,
                    fatalErrorEncountered: true,
                    outputFile: null,
                    errors: progressData.errors || ['Render failed'],
                    overallProgress: 0,
                  },
                  status: 'failed',
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
        } catch (parseError) {
          console.log('⚠️ Could not parse Lambda response:', parseError);
        }
      }
    } catch (lambdaError) {
      console.log('⚠️ Lambda progress call failed:', lambdaError);
    }
    
    // APPROACH 2: Read progress.json directly from S3 (fallback)
    if (progressSource === 'default') {
      try {
        console.log('📁 Trying to read progress.json from S3...');
        
        const progressKey = `renders/${effectiveRenderId}/progress.json`;
        const progressUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/${progressKey}`;
        
        const progressResponse = await aws.fetch(progressUrl, { method: 'GET' });
        
        if (progressResponse.ok) {
          const progressJson = await progressResponse.json();
          console.log('📊 progress.json content:', JSON.stringify(progressJson).substring(0, 300));
          
          // ✅ CHECK FOR ERRORS IN progress.json
          if (progressJson.errors && Array.isArray(progressJson.errors) && progressJson.errors.length > 0) {
            console.log('❌ Remotion render failed with errors:', JSON.stringify(progressJson.errors));
            
            const errorMessages = progressJson.errors.map((e: any) => 
              typeof e === 'string' ? e : (e.message || e.stack || JSON.stringify(e))
            );
            
            // Update DB with failed status
            try {
              await supabaseAdmin
                .from(tableName)
                .update({
                  status: 'failed',
                  error_message: errorMessages[0] || 'Render failed',
                })
                .eq(renderIdColumn, effectiveRenderId);
            } catch (dbError) {
              console.log('⚠️ Could not update DB with error status:', dbError);
            }
            
            return new Response(
              JSON.stringify({
                success: true,
                render_id: effectiveRenderId,
                progress: {
                  done: false,
                  fatalErrorEncountered: true,
                  outputFile: null,
                  errors: errorMessages,
                  overallProgress: 0,
                },
                status: 'failed',
                message: 'Rendering fehlgeschlagen: ' + errorMessages[0],
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          if (typeof progressJson.overallProgress === 'number') {
            estimatedProgress = progressJson.overallProgress;
            progressSource = 's3-progress-json';
            console.log(`✅ S3 progress.json reports: ${Math.round(estimatedProgress * 100)}%`);
          }
        } else {
          console.log('⚠️ progress.json not found (status:', progressResponse.status, ')');
        }
      } catch (s3ProgressError) {
        console.log('⚠️ Could not read progress.json:', s3ProgressError);
      }
    }
    
    // APPROACH 3: Time-based fallback with better estimation
    if (progressSource === 'default') {
      console.log('📊 Using time-based progress estimation...');
      
      // Typical render times:
      // - 15s video: ~60s render
      // - 30s video: ~120s render
      // - 60s video: ~240s render
      // Average: ~4s render time per 1s of video
      const typicalRenderTimeSeconds = 180; // 3 minutes average
      
      // Progress curve: starts slow (Lambda warmup), speeds up, then slows at end
      const rawProgress = elapsedSeconds / typicalRenderTimeSeconds;
      
      if (rawProgress < 0.2) {
        // First 20%: Lambda warming up (slower)
        estimatedProgress = rawProgress * 0.5;
      } else if (rawProgress < 0.8) {
        // Middle 60%: Actual rendering (faster progress)
        estimatedProgress = 0.1 + (rawProgress - 0.2) * 1.2;
      } else {
        // Last 20%: Encoding/uploading (slows down)
        estimatedProgress = 0.82 + (rawProgress - 0.8) * 0.5;
      }
      
      // Cap at 92% for time-based (only real completion can reach 100%)
      estimatedProgress = Math.max(0.05, Math.min(estimatedProgress, 0.92));
      progressSource = 'time-based';
      
      console.log(`📊 Time-based progress: ${Math.round(estimatedProgress * 100)}% (elapsed: ${Math.round(elapsedSeconds)}s)`);
    }
    
    // Calculate meaningful progress message
    let progressMessage = 'Rendering...';
    if (estimatedProgress < 0.2) {
      progressMessage = 'Rendering wird initialisiert...';
    } else if (estimatedProgress < 0.4) {
      progressMessage = 'Szenen werden zusammengestellt...';
    } else if (estimatedProgress < 0.7) {
      progressMessage = 'Video wird gerendert...';
    } else if (estimatedProgress < 0.95) {
      progressMessage = 'Video wird finalisiert...';
    } else {
      progressMessage = 'Fast fertig...';
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        render_id: effectiveRenderId,
        progress: {
          done: false,
          fatalErrorEncountered: false,
          outputFile: null,
          errors: null,
          overallProgress: estimatedProgress,
        },
        status: 'rendering',
        message: `${progressMessage} (${Math.round(estimatedProgress * 100)}%)`,
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
