import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// AWS Lambda configuration
const AWS_REGION = 'eu-central-1';
const LAMBDA_FUNCTION_NAME = 'remotion-render-4-0-377-mem3008mb-disk10240mb-600sec';
const DEFAULT_BUCKET_NAME = 'remotionlambda-eucentral1-13gm4o6s90';

// Timeout: If no video found after 12 minutes, mark as failed
// Lambda has 10min max, plus buffer for S3 write
const RENDER_TIMEOUT_SECONDS = 720;

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

    // If failed in DB - still check S3 first in case video completed after timeout
    if (renderData?.status === 'failed') {
      console.log('⚠️ Render marked as failed in DB, but checking S3 as fallback...');
      
      const bucketNameFallback = renderData?.bucket_name || DEFAULT_BUCKET_NAME;
      
      // Try outName-based S3 reconciliation first
      const outNameFallback = renderData?.content_config?.out_name;
      const recoveredUrl = await reconcileViaOutName(aws, bucketNameFallback, outNameFallback, effectiveRenderId, supabaseAdmin, tableName, renderIdColumn, renderData);
      
      if (recoveredUrl) {
        return new Response(
          JSON.stringify({
            success: true,
            render_id: effectiveRenderId,
            progress: {
              done: true,
              fatalErrorEncountered: false,
              outputFile: recoveredUrl,
              errors: null,
              overallProgress: 1,
            },
            status: 'completed',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Legacy fallback: direct path check
      const isUniversalFallback = source === 'universal-creator' || renderData?.source === 'universal-creator';
      const videoKeyFallback = isUniversalFallback
        ? `universal-video-${effectiveRenderId}.mp4`
        : `renders/${effectiveRenderId}/out.mp4`;
      const s3VideoUrlFallback = `https://${bucketNameFallback}.s3.${AWS_REGION}.amazonaws.com/${videoKeyFallback}`;
      
      try {
        const headResp = await aws.fetch(s3VideoUrlFallback, { method: 'HEAD' });
        if (headResp.ok) {
          console.log('✅ Video found on S3 despite DB failure! Recovering...');
          
          await supabaseAdmin
            .from(tableName)
            .update({
              status: 'completed',
              [outputColumn]: s3VideoUrlFallback,
              completed_at: new Date().toISOString(),
              error_message: null,
            })
            .eq(renderIdColumn, effectiveRenderId);
          
          // Save to Media Library
          if (renderData?.user_id) {
            await saveToMediaLibrary(supabaseAdmin, renderData.user_id, s3VideoUrlFallback, effectiveRenderId, renderData);
          }
          
          return new Response(
            JSON.stringify({
              success: true,
              render_id: effectiveRenderId,
              progress: {
                done: true,
                fatalErrorEncountered: false,
                outputFile: s3VideoUrlFallback,
                errors: null,
                overallProgress: 1,
              },
              status: 'completed',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (s3Err) {
        console.log('S3 fallback check failed:', s3Err);
      }
      
      // Video not on S3 either - truly failed
      console.log('❌ Render failed (confirmed - no video on S3)');
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

    // ✅ Use lambda_invoked_at for timeout (more accurate than created_at)
    const lambdaInvokedAt = renderData?.content_config?.lambda_invoked_at 
      ? new Date(renderData.content_config.lambda_invoked_at).getTime() 
      : null;
    const createdAt = renderData?.created_at ? new Date(renderData.created_at).getTime() : Date.now();
    const timeoutAnchor = lambdaInvokedAt || createdAt;
    const elapsedSeconds = (Date.now() - timeoutAnchor) / 1000;

    // ============================================
    // ✅ TIMEOUT CHECK: Mark as failed after 12 minutes (720s)
    // ============================================
    
    if (elapsedSeconds > RENDER_TIMEOUT_SECONDS) {
      console.log(`⏰ TIMEOUT: Render exceeded ${RENDER_TIMEOUT_SECONDS}s (12 min), but checking S3 via outName first...`);
      
      // ✅ LAST-RESORT: Try outName-based S3 reconciliation before declaring failure
      const outName = renderData?.content_config?.out_name;
      const bucketNameTimeout = renderData?.bucket_name || renderData?.content_config?.bucket_name || DEFAULT_BUCKET_NAME;
      const recoveredUrl = await reconcileViaOutName(aws, bucketNameTimeout, outName, effectiveRenderId, supabaseAdmin, tableName, renderIdColumn, renderData);
      
      if (recoveredUrl) {
        console.log('✅ Video found via outName reconciliation despite timeout!');
        return new Response(
          JSON.stringify({
            success: true,
            render_id: effectiveRenderId,
            progress: {
              done: true,
              fatalErrorEncountered: false,
              outputFile: recoveredUrl,
              errors: null,
              overallProgress: 1,
            },
            status: 'completed',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Truly timed out — no video found anywhere
      console.log('❌ No video found after timeout + outName search, marking as failed');
      
      // Mark as failed in DB
      await supabaseAdmin
        .from(tableName)
        .update({
          status: 'failed',
          error_message: `Render timeout - Video konnte nicht innerhalb von ${Math.round(RENDER_TIMEOUT_SECONDS / 60)} Minuten erstellt werden`,
        })
        .eq(renderIdColumn, effectiveRenderId);

      // ✅ Auch universal_video_progress synchron auf failed setzen
      if (renderData?.user_id) {
        const { data: progressRows } = await supabaseAdmin
          .from('universal_video_progress')
          .select('id')
          .eq('user_id', renderData.user_id)
          .in('status', ['processing', 'pending'])
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (progressRows && progressRows.length > 0) {
          await supabaseAdmin.from('universal_video_progress').update({
            current_step: 'failed',
            status: 'failed',
            progress_percent: 0,
            status_message: `Render-Timeout nach ${Math.round(RENDER_TIMEOUT_SECONDS / 60)} Minuten`,
            updated_at: new Date().toISOString(),
          }).eq('id', progressRows[0].id);
          console.log('📝 Also updated universal_video_progress to failed');
        }
      }
      
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
            errors: [`Render timeout nach ${Math.round(RENDER_TIMEOUT_SECONDS / 60)} Minuten. Credits wurden erstattet.`],
            overallProgress: 0,
          },
          status: 'failed',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // ✅ STEP 2: For pending- IDs, ALSO check S3 first (webhook fallback)
    // Only show simulated progress if video not found on S3
    // ============================================
    
    const isPendingId = effectiveRenderId.startsWith('pending-');
    
    if (isPendingId) {
      console.log('⏳ Pending ID - checking S3 FIRST as webhook fallback');
    }

    // ============================================
    // ✅ STEP 3: Check S3 for video completion
    // ============================================
    
    console.log('🎯 Checking S3 for video status...');
    
    const bucketName = renderData?.bucket_name || renderData?.content_config?.bucket_name || DEFAULT_BUCKET_NAME;
    
    // Determine lambda_render_id from DB content_config
    const lambdaRenderId = renderData?.content_config?.lambda_render_id;
    
    // S3 path for completed video
    const isUniversalCreator = source === 'universal-creator' || renderData?.source === 'universal-creator';
    
    // Build list of S3 keys to check (primary + fallback)
    const keysToCheck: string[] = [];
    if (isUniversalCreator) {
      keysToCheck.push(`universal-video-${effectiveRenderId}.mp4`);
      if (lambdaRenderId && lambdaRenderId !== effectiveRenderId) {
        keysToCheck.push(`universal-video-${lambdaRenderId}.mp4`);
      }
      keysToCheck.push(`renders/${effectiveRenderId}/out.mp4`); // fallback
    } else {
      keysToCheck.push(`renders/${effectiveRenderId}/out.mp4`);
    }
    if (lambdaRenderId && lambdaRenderId !== effectiveRenderId) {
      keysToCheck.push(`renders/${lambdaRenderId}/out.mp4`);
    }
    
    console.log('🔍 Checking S3 keys:', keysToCheck);
    
    let s3VideoUrl: string | null = null;
    
    for (const videoKey of keysToCheck) {
      const candidateUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/${videoKey}`;
      console.log('🔍 Trying S3 path:', candidateUrl);
      
      try {
        const headResponse = await aws.fetch(candidateUrl, { method: 'HEAD' });
        console.log('📥 S3 HEAD response for', videoKey, ':', headResponse.status);
        
        if (headResponse.ok) {
          s3VideoUrl = candidateUrl;
          console.log('✅ Video found on S3!');
          break;
        }
      } catch (s3Error) {
        console.log('⚠️ S3 check error for', videoKey, ':', s3Error);
      }
    }
    
    // ✅ If direct paths failed, try outName-based S3 ListObjects reconciliation
    if (!s3VideoUrl) {
      const outName = renderData?.content_config?.out_name;
      if (outName) {
        console.log(`🔍 Direct paths failed, trying outName reconciliation: ${outName}`);
        const recoveredUrl = await reconcileViaOutName(aws, bucketName, outName, effectiveRenderId, supabaseAdmin, tableName, renderIdColumn, renderData);
        if (recoveredUrl) {
          s3VideoUrl = recoveredUrl;
        }
      }
    }
    
    if (s3VideoUrl) {
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
        
        // Save to Media Library
        if (renderData?.user_id) {
          console.log('📚 Saving video to Media Library...');
          
          const { data: existingVideo } = await supabaseAdmin
            .from('video_creations')
            .select('id')
            .eq('output_url', s3VideoUrl)
            .maybeSingle();
          
          if (!existingVideo) {
            await supabaseAdmin
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
            console.log('✅ Video saved to Media Library');
          }
          
          // Also save to media_assets
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

    // ============================================
    // ✅ STEP 4: Check progress.json for errors or progress
    // ============================================
    
    let estimatedProgress = 0.15;
    let progressSource = 'default';
    
    try {
      console.log('📁 Checking progress.json from S3...');
      
      // Primary: try with effectiveRenderId (= pendingRenderId)
      let progressKey = `renders/${effectiveRenderId}/progress.json`;
      let progressUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/${progressKey}`;
      
      let progressResponse = await aws.fetch(progressUrl, { method: 'GET' });
      
      // Fallback: try with lambda_render_id from DB (realRenderId)
      // progress.json is written by Lambda under renders/{realRenderId}/progress.json
      if (!progressResponse.ok && renderData?.content_config?.lambda_render_id) {
        const lambdaRenderId = renderData.content_config.lambda_render_id;
        console.log(`⚠️ progress.json not found with ${effectiveRenderId}, trying lambda_render_id=${lambdaRenderId}`);
        progressKey = `renders/${lambdaRenderId}/progress.json`;
        progressUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/${progressKey}`;
        progressResponse = await aws.fetch(progressUrl, { method: 'GET' });
      }
      
      if (progressResponse.ok) {
        const progressJson = await progressResponse.json();
        console.log('📊 progress.json content:', JSON.stringify(progressJson).substring(0, 500));
        
        // ✅ CHECK FOR ERRORS
        if (progressJson.errors && Array.isArray(progressJson.errors) && progressJson.errors.length > 0) {
          console.log('❌ Remotion render failed with errors:', JSON.stringify(progressJson.errors));
          
          const errorMessages = progressJson.errors.map((e: any) => 
            typeof e === 'string' ? e : (e.message || e.stack || JSON.stringify(e))
          );
          
          // Update DB with failed status
          await supabaseAdmin
            .from(tableName)
            .update({
              status: 'failed',
              error_message: errorMessages[0] || 'Render failed',
            })
            .eq(renderIdColumn, effectiveRenderId);
          
          // Refund credits
          if (renderData?.content_config?.credits_used && renderData?.user_id) {
            try {
              await supabaseAdmin.rpc('increment_balance', {
                p_user_id: renderData.user_id,
                p_amount: renderData.content_config.credits_used
              });
              console.log(`💰 Refunded ${renderData.content_config.credits_used} credits`);
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
                errors: errorMessages,
                overallProgress: 0,
              },
              status: 'failed',
              message: 'Rendering fehlgeschlagen: ' + errorMessages[0],
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // ✅ CHECK FOR FATAL ERROR FLAG
        if (progressJson.fatalErrorEncountered) {
          console.log('❌ Fatal error encountered in progress.json');
          
          const errorMsg = progressJson.message || 'Fatal rendering error';
          
          await supabaseAdmin
            .from(tableName)
            .update({
              status: 'failed',
              error_message: errorMsg,
            })
            .eq(renderIdColumn, effectiveRenderId);
          
          // Refund credits
          if (renderData?.content_config?.credits_used && renderData?.user_id) {
            try {
              await supabaseAdmin.rpc('increment_balance', {
                p_user_id: renderData.user_id,
                p_amount: renderData.content_config.credits_used
              });
              console.log(`💰 Refunded ${renderData.content_config.credits_used} credits`);
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
                errors: [errorMsg],
                overallProgress: 0,
              },
              status: 'failed',
              message: 'Rendering fehlgeschlagen: ' + errorMsg,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // ✅ GET PROGRESS
        if (typeof progressJson.overallProgress === 'number') {
          estimatedProgress = progressJson.overallProgress;
          progressSource = 's3-progress-json';
          console.log(`✅ S3 progress.json reports: ${Math.round(estimatedProgress * 100)}%`);
        }
        
        // Check if done
        if (progressJson.done && progressJson.outputFile) {
          console.log('✅ Progress reports done with output:', progressJson.outputFile);
          
          await supabaseAdmin
            .from(tableName)
            .update({
              status: 'completed',
              [outputColumn]: progressJson.outputFile,
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
                outputFile: progressJson.outputFile,
                errors: null,
                overallProgress: 1,
              },
              status: 'completed',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        console.log('⚠️ progress.json not found (status:', progressResponse.status, ')');
      }
    } catch (progressError) {
      console.log('⚠️ Could not read progress.json:', progressError);
    }

    // ============================================
    // ✅ STEP 5: Time-based fallback
    // ============================================
    
    if (progressSource === 'default') {
      console.log('📊 Using time-based progress estimation...');
      
      const typicalRenderTimeSeconds = 180;
      const rawProgress = elapsedSeconds / typicalRenderTimeSeconds;
      
      if (rawProgress < 0.2) {
        estimatedProgress = rawProgress * 0.5;
      } else if (rawProgress < 0.8) {
        estimatedProgress = 0.1 + (rawProgress - 0.2) * 1.2;
      } else {
        estimatedProgress = 0.82 + (rawProgress - 0.8) * 0.5;
      }
      
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
          progressSource: progressSource,
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

// ============================================
// ✅ HELPER: OutName-based S3 Reconciliation
// Searches S3 renders/ prefix for a file matching the outName
// ============================================
async function reconcileViaOutName(
  aws: any,
  bucketName: string,
  outName: string | null | undefined,
  effectiveRenderId: string,
  supabaseAdmin: any,
  tableName: string,
  renderIdColumn: string,
  renderData: any,
): Promise<string | null> {
  if (!outName) {
    console.log('⚠️ No outName available for reconciliation');
    return null;
  }
  
  console.log(`🔍 OutName reconciliation: searching for "${outName}" in renders/`);
  
  try {
    const listUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/?list-type=2&prefix=renders/&max-keys=200`;
    const listResp = await aws.fetch(listUrl, { method: 'GET' });
    
    if (!listResp.ok) {
      console.log('⚠️ S3 ListObjects failed:', listResp.status);
      return null;
    }
    
    const listXml = await listResp.text();
    
    // Parse XML to find keys ending with outName
    const keyRegex = /<Key>([^<]+)<\/Key>/g;
    let match;
    let foundKey: string | null = null;
    
    while ((match = keyRegex.exec(listXml)) !== null) {
      const key = match[1];
      if (key.endsWith(outName)) {
        foundKey = key;
        break;
      }
    }
    
    if (!foundKey) {
      console.log(`⚠️ OutName "${outName}" not found in S3 renders/`);
      return null;
    }
    
    console.log(`✅ Found video via outName! Key: ${foundKey}`);
    
    // Extract real Remotion render ID from path: renders/{realId}/outName
    const pathParts = foundKey.split('/');
    const realRenderId = pathParts.length >= 3 ? pathParts[1] : null;
    
    const s3VideoUrl = `https://${bucketName}.s3.${AWS_REGION}.amazonaws.com/${foundKey}`;
    
    // Verify file exists via HEAD
    const headResp = await aws.fetch(s3VideoUrl, { method: 'HEAD' });
    if (!headResp.ok) {
      console.log('⚠️ HEAD check failed for found key');
      return null;
    }
    
    console.log(`✅ Video confirmed on S3! Real render ID: ${realRenderId}`);
    
    // Update DB with completed status and real render ID
    const outputColumn = tableName === 'director_cut_renders' ? 'output_url' : 'video_url';
    const updateData: any = {
      status: 'completed',
      [outputColumn]: s3VideoUrl,
      completed_at: new Date().toISOString(),
      error_message: null,
    };
    
    // Persist real render ID if discovered
    if (realRenderId && renderData?.content_config) {
      updateData.content_config = {
        ...renderData.content_config,
        real_remotion_render_id: realRenderId,
        reconciled_via: 'outName-s3-list',
        reconciled_at: new Date().toISOString(),
      };
    }
    
    await supabaseAdmin
      .from(tableName)
      .update(updateData)
      .eq(renderIdColumn, effectiveRenderId);
    
    // Save to Media Library
    if (renderData?.user_id) {
      await saveToMediaLibrary(supabaseAdmin, renderData.user_id, s3VideoUrl, effectiveRenderId, renderData);
    }
    
    // Update universal_video_progress
    if (renderData?.user_id) {
      const { data: progressRows } = await supabaseAdmin
        .from('universal_video_progress')
        .select('id, result_data')
        .eq('user_id', renderData.user_id)
        .in('status', ['processing', 'pending', 'rendering'])
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (progressRows?.length > 0) {
        const existingResultData = (progressRows[0].result_data as any) || {};
        await supabaseAdmin.from('universal_video_progress').update({
          status: 'completed',
          current_step: 'completed',
          progress_percent: 100,
          status_message: '✅ Video fertig!',
          result_data: { ...existingResultData, outputUrl: s3VideoUrl, realRenderId },
          updated_at: new Date().toISOString(),
        }).eq('id', progressRows[0].id);
        console.log('✅ universal_video_progress updated to completed via outName reconciliation');
      }
    }
    
    return s3VideoUrl;
  } catch (err) {
    console.error('⚠️ OutName reconciliation error:', err);
    return null;
  }
}

// ============================================
// ✅ HELPER: Save to Media Library (deduplicated)
// ============================================
async function saveToMediaLibrary(
  supabaseAdmin: any,
  userId: string,
  videoUrl: string,
  renderId: string,
  renderData: any,
) {
  try {
    const { data: existingVid } = await supabaseAdmin
      .from('video_creations')
      .select('id')
      .eq('output_url', videoUrl)
      .maybeSingle();
    
    if (!existingVid) {
      await supabaseAdmin.from('video_creations').insert({
        user_id: userId,
        output_url: videoUrl,
        status: 'completed',
        metadata: {
          source: 'universal-creator',
          render_id: renderId,
          format_config: renderData?.format_config,
          content_config: renderData?.content_config,
        }
      });
    }
    
    const { data: existingAsset } = await supabaseAdmin
      .from('media_assets')
      .select('id')
      .eq('original_url', videoUrl)
      .maybeSingle();
    
    if (!existingAsset) {
      await supabaseAdmin.from('media_assets').insert({
        user_id: userId,
        type: 'video',
        original_url: videoUrl,
        storage_path: videoUrl,
        source: 'remotion-render',
      });
    }
    
    console.log('✅ Saved to Media Library');
  } catch (err) {
    console.error('⚠️ Media Library save error:', err);
  }
}
