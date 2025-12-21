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
    // Find the real renderId by scanning S3
    // ============================================
    
    console.log('📊 Pending ID detected - starting S3 Render Discovery...');
    
    const createdAt = renderData?.created_at ? new Date(renderData.created_at).getTime() : Date.now();
    const elapsedSeconds = (Date.now() - createdAt) / 1000;
    
    // Get outName from format_config
    const outName = renderData?.format_config?.out_name;
    console.log('🔍 Looking for outName:', outName);
    
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
    // ✅ S3 RENDER DISCOVERY: Find real renderId
    // ============================================
    
    if (outName && elapsedSeconds >= 20) {
      try {
        console.log('🔍 Scanning S3 for renders with outName:', outName);
        
        // List all render folders in S3
        const s3ListUrl = `https://s3.${AWS_REGION}.amazonaws.com/${DEFAULT_BUCKET_NAME}?list-type=2&prefix=renders/&delimiter=/`;
        
        const listResponse = await aws.fetch(s3ListUrl, { method: 'GET' });
        
        if (listResponse.ok) {
          const xmlText = await listResponse.text();
          
          // Extract all render folder prefixes: renders/{renderId}/
          const prefixRegex = /<Prefix>(renders\/[^\/]+\/)<\/Prefix>/g;
          const prefixMatches = [...xmlText.matchAll(prefixRegex)];
          const renderFolders = prefixMatches.map(m => m[1]);
          
          console.log(`📦 Found ${renderFolders.length} render folders`);
          
          // Check recent folders (last 10) for our outName
          const recentFolders = renderFolders.slice(-10);
          
          for (const folder of recentFolders) {
            // List contents of this render folder
            const folderListUrl = `https://s3.${AWS_REGION}.amazonaws.com/${DEFAULT_BUCKET_NAME}?list-type=2&prefix=${folder}&max-keys=50`;
            
            const folderResponse = await aws.fetch(folderListUrl, { method: 'GET' });
            
            if (folderResponse.ok) {
              const folderXml = await folderResponse.text();
              
              // Check if our outName exists in this folder
              if (folderXml.includes(outName)) {
                // Extract the real renderId from the folder path
                const realRenderId = folder.replace('renders/', '').replace('/', '');
                console.log('🎯 FOUND! Real renderId:', realRenderId);
                
                // Update DB: Replace pending ID with real renderId
                await supabaseAdmin
                  .from('video_renders')
                  .update({
                    render_id: realRenderId,
                  })
                  .eq('render_id', effectiveRenderId);
                
                console.log('✅ DB updated: pending ID → real renderId');
                
                // Now query AWS with the real renderId
                const progressPayload = {
                  type: 'status',
                  bucketName: DEFAULT_BUCKET_NAME,
                  renderId: realRenderId,
                };

                const lambdaStatusResponse = await aws.fetch(lambdaUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(progressPayload),
                });

                if (lambdaStatusResponse.status === 200) {
                  const awsStatus = await lambdaStatusResponse.json();
                  console.log('📥 AWS Status for real renderId:', JSON.stringify(awsStatus));

                  if (awsStatus.done === true) {
                    const outputFile = awsStatus.outputFile || awsStatus.url;
                    console.log('✅ Render COMPLETE! URL:', outputFile);

                    if (outputFile) {
                      await supabaseAdmin
                        .from('video_renders')
                        .update({
                          status: 'completed',
                          video_url: outputFile,
                          completed_at: new Date().toISOString(),
                        })
                        .eq('render_id', realRenderId);
                    }

                    return new Response(
                      JSON.stringify({
                        success: true,
                        render_id: realRenderId,
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

                  // Return real progress
                  const realProgress = awsStatus.overallProgress || 0.5;
                  return new Response(
                    JSON.stringify({
                      success: true,
                      render_id: realRenderId,
                      done: false,
                      fatalErrorEncountered: awsStatus.fatalErrorEncountered || false,
                      outputFile: null,
                      errors: awsStatus.errors || null,
                      overallProgress: realProgress,
                      status: 'rendering',
                      message: `Rendering... (${Math.round(realProgress * 100)}%)`,
                    }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                  );
                }
                
                break; // Found our render, exit loop
              }
            }
          }
          
          // Also check for completed video directly
          // Pattern: renders/{renderId}/{outName}
          const videoSearchUrl = `https://s3.${AWS_REGION}.amazonaws.com/${DEFAULT_BUCKET_NAME}?list-type=2&prefix=renders/&max-keys=200`;
          const videoSearchResponse = await aws.fetch(videoSearchUrl, { method: 'GET' });
          
          if (videoSearchResponse.ok) {
            const searchXml = await videoSearchResponse.text();
            
            // Look for our outName in any key
            const keyRegex = new RegExp(`<Key>(renders/([^/]+)/${outName.replace('.mp4', '')}[^<]*\\.mp4)</Key>`, 'g');
            const keyMatches = [...searchXml.matchAll(keyRegex)];
            
            if (keyMatches.length > 0) {
              const fullKey = keyMatches[0][1];
              const discoveredRenderId = keyMatches[0][2];
              const s3Url = `https://${DEFAULT_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${fullKey}`;
              
              console.log('✅ Video found directly on S3!');
              console.log('   Key:', fullKey);
              console.log('   Real renderId:', discoveredRenderId);
              console.log('   URL:', s3Url);
              
              // Update DB with real renderId and completed status
              await supabaseAdmin
                .from('video_renders')
                .update({
                  render_id: discoveredRenderId,
                  status: 'completed',
                  video_url: s3Url,
                  completed_at: new Date().toISOString(),
                })
                .eq('render_id', effectiveRenderId);
              
              return new Response(
                JSON.stringify({
                  success: true,
                  render_id: discoveredRenderId,
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
        }
      } catch (s3Error) {
        console.error('⚠️ S3 discovery error:', s3Error);
      }
    }

    // ============================================
    // ✅ FALLBACK: Time-based simulated progress
    // ============================================
    
    // Progress: 15% to 90% over 3 minutes (180 seconds)
    const progressRatio = Math.min((elapsedSeconds - 20) / 160, 1);
    const simulatedProgress = 0.15 + 0.75 * progressRatio;
    
    // If over 6 minutes and still no video, show warning
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
          overallProgress: 0.95,
          status: 'rendering',
          message: 'Rendering dauert länger als erwartet...',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Still searching for video, return simulated progress
    console.log(`📊 Simulated progress: ${Math.round(simulatedProgress * 100)}% (elapsed: ${Math.round(elapsedSeconds)}s)`);
    
    return new Response(
      JSON.stringify({
        success: true,
        render_id: effectiveRenderId,
        done: false,
        fatalErrorEncountered: false,
        outputFile: null,
        errors: null,
        overallProgress: Math.min(simulatedProgress, 0.90),
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
