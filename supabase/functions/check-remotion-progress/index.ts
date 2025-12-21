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
      if (renderData?.content_config?.credits_used) {
        const userId = renderData.user_id;
        const creditsToRefund = renderData.content_config.credits_used;
        
        try {
          await supabaseAdmin.rpc('increment_balance', {
            p_user_id: userId,
            p_amount: creditsToRefund
          });
          console.log(`💰 Refunded ${creditsToRefund} credits to user ${userId}`);
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
    // ✅ STEP 2: If we have a REAL renderId, query AWS
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
    // ✅ STEP 3: PENDING ID - S3 Render Discovery
    // Find the real renderId by scanning S3 for out.mp4 files
    // ============================================
    
    console.log('📊 Pending ID detected - starting S3 Render Discovery...');
    
    // Early phase: Just show startup progress (first 20 seconds)
    if (elapsedSeconds < 20) {
      const startupProgress = 0.05 + (elapsedSeconds / 20) * 0.10; // 5% to 15%
      return new Response(
        JSON.stringify({
          success: true,
          render_id: effectiveRenderId,
          done: false,
          fatalErrorEncountered: false,
          outputFile: null,
          errors: null,
          overallProgress: startupProgress,
          status: 'rendering',
          message: 'Rendering wird gestartet...',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // ✅ S3 RENDER DISCOVERY: Find out.mp4 files and match by timestamp
    // Remotion ALWAYS creates out.mp4 regardless of outName parameter
    // ============================================
    
    if (elapsedSeconds >= 20) {
      try {
        console.log('🔍 Scanning S3 for out.mp4 files (timestamp matching)...');
        console.log(`   Render started at: ${new Date(createdAt).toISOString()}`);
        
        // List ALL objects with renders/ prefix to find out.mp4 files
        const s3ListUrl = `https://s3.${AWS_REGION}.amazonaws.com/${DEFAULT_BUCKET_NAME}?list-type=2&prefix=renders/&max-keys=500`;
        
        const listResponse = await aws.fetch(s3ListUrl, { method: 'GET' });
        
        if (listResponse.ok) {
          const xmlText = await listResponse.text();
          
          // Extract all out.mp4 keys with their LastModified timestamps
          // Pattern: <Key>renders/{renderId}/out.mp4</Key>...<LastModified>2024-01-15T12:34:56.000Z</LastModified>
          const keyMatches: { key: string; renderId: string; lastModified: number }[] = [];
          
          // Parse XML to find all out.mp4 files
          const contentRegex = /<Key>(renders\/([^\/]+)\/out\.mp4)<\/Key>[\s\S]*?<LastModified>([^<]+)<\/LastModified>/g;
          let match;
          
          while ((match = contentRegex.exec(xmlText)) !== null) {
            const fullKey = match[1];
            const renderId = match[2];
            const lastModifiedStr = match[3];
            const lastModified = new Date(lastModifiedStr).getTime();
            
            keyMatches.push({ key: fullKey, renderId, lastModified });
          }
          
          console.log(`📦 Found ${keyMatches.length} out.mp4 files on S3`);
          
          // Filter to recent files (created after our render started, within 10 minute window)
          const renderStartTime = createdAt - 60000; // 1 minute before to account for clock drift
          const renderEndTime = createdAt + 600000; // 10 minutes after
          
          const relevantFiles = keyMatches.filter(f => 
            f.lastModified > renderStartTime && f.lastModified < renderEndTime
          );
          
          console.log(`📦 ${relevantFiles.length} files in time window (${new Date(renderStartTime).toISOString()} - ${new Date(renderEndTime).toISOString()})`);
          
          // Sort by lastModified descending (newest first)
          relevantFiles.sort((a, b) => b.lastModified - a.lastModified);
          
          // Try to find a matching render
          // Best match: File modified 1-5 minutes after our render started
          for (const file of relevantFiles) {
            const timeDiff = file.lastModified - createdAt;
            const minutesAfterStart = timeDiff / 60000;
            
            console.log(`   Checking: ${file.renderId}, modified ${minutesAfterStart.toFixed(1)} min after render start`);
            
            // A video typically completes 1-5 minutes after the render starts
            if (minutesAfterStart >= 0.5 && minutesAfterStart <= 8) {
              const realRenderId = file.renderId;
              const s3Url = `https://${DEFAULT_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${file.key}`;
              
              console.log('🎯 MATCH FOUND!');
              console.log(`   Real renderId: ${realRenderId}`);
              console.log(`   Video URL: ${s3Url}`);
              console.log(`   Completed ${minutesAfterStart.toFixed(1)} min after start`);
              
              // Update DB: Replace pending ID with real renderId and mark complete
              await supabaseAdmin
                .from('video_renders')
                .update({
                  render_id: realRenderId,
                  status: 'completed',
                  video_url: s3Url,
                  completed_at: new Date().toISOString(),
                })
                .eq('render_id', effectiveRenderId);
              
              console.log('✅ DB updated: pending ID → real renderId, status → completed');
              
              return new Response(
                JSON.stringify({
                  success: true,
                  render_id: realRenderId,
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
          }
          
          // No exact match found yet - look for any unassigned recent render
          // Query DB to get all currently active pending render IDs to avoid conflicts
          const { data: activeRenders } = await supabaseAdmin
            .from('video_renders')
            .select('render_id, created_at')
            .like('render_id', 'pending-%')
            .eq('status', 'rendering');
          
          const activeRenderStarts = (activeRenders || []).map(r => ({
            pendingId: r.render_id,
            createdAt: new Date(r.created_at).getTime()
          }));
          
          console.log(`📊 Active pending renders: ${activeRenderStarts.length}`);
          
          // Try to assign any unassigned video from S3 to this render
          for (const file of relevantFiles) {
            const timeDiff = file.lastModified - createdAt;
            const minutesAfterStart = timeDiff / 60000;
            
            // Check if this renderId is already assigned in DB
            const { data: existingRender } = await supabaseAdmin
              .from('video_renders')
              .select('id')
              .eq('render_id', file.renderId)
              .maybeSingle();
            
            if (!existingRender && minutesAfterStart > 0) {
              // This render is not yet assigned - claim it!
              const realRenderId = file.renderId;
              const s3Url = `https://${DEFAULT_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${file.key}`;
              
              console.log('🎯 Claiming unassigned render!');
              console.log(`   Real renderId: ${realRenderId}`);
              console.log(`   Video URL: ${s3Url}`);
              
              await supabaseAdmin
                .from('video_renders')
                .update({
                  render_id: realRenderId,
                  status: 'completed',
                  video_url: s3Url,
                  completed_at: new Date().toISOString(),
                })
                .eq('render_id', effectiveRenderId);
              
              return new Response(
                JSON.stringify({
                  success: true,
                  render_id: realRenderId,
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
          }
          
          console.log('⏳ No matching video found yet, render still in progress...');
        } else {
          console.error('❌ S3 list request failed:', listResponse.status);
        }
      } catch (s3Error) {
        console.error('⚠️ S3 discovery error:', s3Error);
      }
    }

    // ============================================
    // ✅ FALLBACK: Time-based simulated progress
    // ============================================
    
    // Progress: 15% to 92% over 4 minutes (240 seconds) - never show 100% unless actually done
    const progressRatio = Math.min((elapsedSeconds - 20) / 220, 1);
    const simulatedProgress = 0.15 + 0.77 * progressRatio; // Max 92%
    
    // Different messages based on elapsed time
    let progressMessage = 'Video wird gerendert...';
    if (elapsedSeconds > 180) {
      progressMessage = 'Rendering fast abgeschlossen...';
    } else if (elapsedSeconds > 120) {
      progressMessage = 'Video wird finalisiert...';
    } else if (elapsedSeconds > 60) {
      progressMessage = 'Frames werden verarbeitet...';
    }
    
    console.log(`📊 Simulated progress: ${Math.round(simulatedProgress * 100)}% (elapsed: ${Math.round(elapsedSeconds)}s)`);
    
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
        message: progressMessage,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error checking progress:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        done: false,
        fatalErrorEncountered: true,
        overallProgress: 0,
        status: 'error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
