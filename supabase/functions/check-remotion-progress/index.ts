import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default bucket name for Remotion Lambda
const DEFAULT_BUCKET_NAME = 'remotionlambda-eucentral1-13gm4o6s90';
const REMOTION_FUNCTION_NAME = 'remotion-render-4-0-377-mem3008mb-disk10240mb-600sec';
const AWS_REGION = 'eu-central-1';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Check Remotion progress request received');
    
    const { render_id, renderId, source, bucketName: providedBucketName } = await req.json();
    
    // Support both render_id and renderId parameter names
    let effectiveRenderId = render_id || renderId;
    
    if (!effectiveRenderId) {
      throw new Error('render_id is required');
    }

    console.log('📊 Checking progress for render:', effectiveRenderId, 'source:', source);

    // Initialize Supabase admin client for database queries
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ============================================
    // ✅ HANDLE PENDING RENDER IDs
    // ============================================
    if (effectiveRenderId.startsWith('pending-')) {
      console.log('⏳ Pending render ID detected, querying database for real render ID...');
      
      // Query database for the real render ID
      const { data: renderData, error: renderError } = await supabaseAdmin
        .from('video_renders')
        .select('render_id, bucket_name, status, error_message')
        .or(`render_id.eq.${effectiveRenderId}`)
        .single();

      if (renderError || !renderData) {
        console.log('📋 Pending render not found or still pending, returning queued status');
        return new Response(
          JSON.stringify({
            success: true,
            render_id: effectiveRenderId,
            done: false,
            fatalErrorEncountered: false,
            outputFile: null,
            errors: null,
            overallProgress: 0,
            status: 'queued',
            message: 'Render is being prepared...',
            progress: {
              done: false,
              fatalErrorEncountered: false,
              outputFile: null,
              errors: null,
              overallProgress: 0,
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Check if the render failed during Lambda invocation
      if (renderData.status === 'failed') {
        console.log('❌ Render failed during Lambda invocation');
        return new Response(
          JSON.stringify({
            success: true,
            render_id: effectiveRenderId,
            done: false,
            fatalErrorEncountered: true,
            outputFile: null,
            errors: [renderData.error_message || 'Lambda invocation failed'],
            overallProgress: 0,
            status: 'failed',
            progress: {
              done: false,
              fatalErrorEncountered: true,
              outputFile: null,
              errors: [renderData.error_message || 'Lambda invocation failed'],
              overallProgress: 0,
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Check if the real render ID is still pending
      if (renderData.render_id.startsWith('pending-') || renderData.status === 'queued') {
        console.log('⏳ Real render ID still pending, Lambda not yet responded');
        return new Response(
          JSON.stringify({
            success: true,
            render_id: effectiveRenderId,
            done: false,
            fatalErrorEncountered: false,
            outputFile: null,
            errors: null,
            overallProgress: 0.02, // Show minimal progress
            status: 'queued',
            message: 'Lambda invocation in progress...',
            progress: {
              done: false,
              fatalErrorEncountered: false,
              outputFile: null,
              errors: null,
              overallProgress: 0.02,
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // We have the real render ID now
      console.log('✅ Found real render ID:', renderData.render_id);
      effectiveRenderId = renderData.render_id;
    }

    let bucketName = providedBucketName;

    // Determine bucket name based on source
    if (!bucketName) {
      if (source === 'sora-long-form') {
        // For sora-long-form, use default bucket or provided bucket
        bucketName = DEFAULT_BUCKET_NAME;
        console.log('🎬 Using default bucket for sora-long-form:', bucketName);
      } else {
        // Determine which table to query based on source
        const isDirectorsCut = source === 'directors-cut';
        const tableName = isDirectorsCut ? 'director_cut_renders' : 'video_renders';
        const renderIdColumn = isDirectorsCut ? 'remotion_render_id' : 'render_id';

        console.log('📋 Querying table:', tableName, 'column:', renderIdColumn);

        // Fetch bucket_name from database
        const { data: renderData, error: renderError } = await supabaseAdmin
          .from(tableName)
          .select('bucket_name')
          .eq(renderIdColumn, effectiveRenderId)
          .single();

        if (renderError || !renderData?.bucket_name) {
          console.error('Render lookup error:', renderError);
          // Fallback to default bucket
          bucketName = DEFAULT_BUCKET_NAME;
          console.log('⚠️ Using fallback bucket:', bucketName);
        } else {
          bucketName = renderData.bucket_name;
        }
      }
    }

    console.log('🪣 Using bucket_name:', bucketName);

    // ============================================
    // ✅ USE AWS API DIRECTLY (Deno-compatible)
    // ============================================
    console.log('🚀 Getting render progress via AWS Lambda API...');
    
    const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured');
    }

    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      region: AWS_REGION,
    });

    // Call the Remotion Lambda function with type: 'status'
    const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${REMOTION_FUNCTION_NAME}/invocations`;
    
    const statusPayload = {
      type: 'status',
      bucketName: bucketName,
      renderId: effectiveRenderId,
      version: '4.0.377',
      logLevel: 'info',
    };

    console.log('📤 Calling Lambda with status payload:', JSON.stringify(statusPayload));

    const lambdaResponse = await aws.fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(statusPayload),
    });

    if (!lambdaResponse.ok) {
      const errorText = await lambdaResponse.text();
      console.error('❌ Lambda status call failed:', lambdaResponse.status, errorText);
      throw new Error(`Lambda status call failed: ${lambdaResponse.status} - ${errorText}`);
    }

    const progressRaw = await lambdaResponse.json();
    console.log('📥 Raw Lambda response:', JSON.stringify(progressRaw, null, 2));

    // Handle Lambda error response
    if (progressRaw.errorMessage || progressRaw.errorType) {
      console.error('❌ Lambda returned error:', progressRaw.errorMessage);
      throw new Error(progressRaw.errorMessage || 'Lambda function error');
    }

    // Parse progress from Lambda response
    const progress = {
      done: progressRaw.done || false,
      fatalErrorEncountered: progressRaw.fatalErrorEncountered || false,
      outputFile: progressRaw.outputFile || null,
      errors: progressRaw.errors || null,
      overallProgress: progressRaw.overallProgress || 0,
    };

    console.log('📊 Parsed progress:', JSON.stringify(progress, null, 2));

    // Update database if render is complete or failed
    if (progress.done || progress.fatalErrorEncountered) {
      console.log('✅ Render status changed, updating database...');

      if (source === 'sora-long-form') {
        // For sora-long-form, we don't have a separate renders table
        // The FinalExport component will handle the project update
        console.log('🎬 Sora long-form render status:', progress.done ? 'completed' : 'failed');
      } else {
        const isDirectorsCut = source === 'directors-cut';
        const tableName = isDirectorsCut ? 'director_cut_renders' : 'video_renders';
        const renderIdColumn = isDirectorsCut ? 'remotion_render_id' : 'render_id';

        if (progress.done && progress.outputFile) {
          // Render completed successfully
          const updateData = isDirectorsCut 
            ? {
                status: 'completed',
                output_url: progress.outputFile,
                error_message: null,
                progress: 100
              }
            : {
                status: 'completed',
                video_url: progress.outputFile,
                error_message: null,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };

          await supabaseAdmin
            .from(tableName)
            .update(updateData)
            .eq(renderIdColumn, effectiveRenderId);

          console.log('✅ Marked render as completed in database');

          // Save to video_creations for Media Library (both sources)
          if (!isDirectorsCut) {
            // Universal Creator: Fetch render data for video_creations
            const { data: renderDetails, error: fetchError } = await supabaseAdmin
              .from('video_renders')
              .select('user_id, format_config, project_id')
              .eq('render_id', effectiveRenderId)
              .single();

            if (!fetchError && renderDetails) {
              const { data: existingVideo } = await supabaseAdmin
                .from('video_creations')
                .select('id')
                .eq('metadata->>render_id', effectiveRenderId)
                .single();

              if (!existingVideo) {
                const { error: insertError } = await supabaseAdmin
                  .from('video_creations')
                  .insert({
                    user_id: renderDetails.user_id,
                    output_url: progress.outputFile,
                    status: 'completed',
                    metadata: {
                      source: 'universal-creator',
                      render_id: effectiveRenderId,
                      format_config: renderDetails.format_config,
                      project_id: renderDetails.project_id
                    }
                  });

                if (insertError) {
                  console.error('Failed to insert into video_creations:', insertError);
                } else {
                  console.log('✅ Video saved to Media Library (video_creations)');
                }
              }
            }
          }
        } else if (progress.fatalErrorEncountered) {
          // Render failed - properly extract error messages from error objects
          const errorMessage = progress.errors?.map((e: any) => 
            typeof e === 'string' ? e : e.message || JSON.stringify(e)
          ).join(', ') || 'Unknown error';
          
          const updateData = isDirectorsCut
            ? {
                status: 'failed',
                error_message: errorMessage
              }
            : {
                status: 'failed',
                error_message: errorMessage,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };

          await supabaseAdmin
            .from(tableName)
            .update(updateData)
            .eq(renderIdColumn, effectiveRenderId);

          console.log('❌ Marked render as failed in database');
        }
      }
    }

    // Return progress data to frontend
    return new Response(
      JSON.stringify({
        success: true,
        render_id: effectiveRenderId,
        done: progress.done,
        fatalErrorEncountered: progress.fatalErrorEncountered,
        outputFile: progress.outputFile,
        errors: progress.errors,
        overallProgress: progress.overallProgress,
        progress: progress
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
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
