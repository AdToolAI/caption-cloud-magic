import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, X-Remotion-Status, X-Remotion-Signature, X-Remotion-Mode',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Remotion webhook received');
    console.log('Request method:', req.method);
    console.log('Request headers:', JSON.stringify(Object.fromEntries(req.headers.entries())));
    
    // Parse webhook payload
    const payload = await req.json();
    console.log('Webhook payload:', JSON.stringify(payload, null, 2));

    const { type, renderId, outputFile, errors, bucketName, customData } = payload;

    // Create admin client (webhooks don't have user auth)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if this is a Director's Cut render (via customData or by checking director_cut_renders table)
    const isDirectorsCut = customData?.source === 'directors-cut';
    const renderJobId = customData?.render_job_id;
    const userId = customData?.user_id;

    console.log(`[RemotionWebhook] isDirectorsCut: ${isDirectorsCut}, renderJobId: ${renderJobId}`);

    // Handle different webhook types
    if (type === 'success') {
      console.log(`Render ${renderId} completed successfully`);
      
      if (isDirectorsCut && renderJobId) {
        // Update director_cut_renders table
        const { error: updateError } = await supabaseAdmin
          .from('director_cut_renders')
          .update({
            status: 'completed',
            output_url: outputFile,
            error_message: null,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', renderJobId);

        if (updateError) {
          console.error('Failed to update director_cut_renders:', updateError);
          throw updateError;
        }

        console.log('Director\'s Cut render marked as completed');

        // Also save to video_creations for Media Library
        if (userId) {
          const { error: insertError } = await supabaseAdmin
            .from('video_creations')
            .insert({
              user_id: userId,
              output_url: outputFile,
              status: 'completed',
              metadata: {
                source: 'directors-cut',
                render_id: renderId,
                render_job_id: renderJobId,
              }
            });

          if (insertError) {
            console.error('Failed to insert Director\'s Cut video into video_creations:', insertError);
          } else {
            console.log('✅ Director\'s Cut video saved to Media Library (video_creations)');
          }
        }
      } else {
        // Original Universal Creator flow - Update video_renders table
        const { error: updateError } = await supabaseAdmin
          .from('video_renders')
          .update({
            status: 'completed',
            video_url: outputFile,
            error_message: null,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('render_id', renderId);

        if (updateError) {
          console.error('Failed to update video_renders:', updateError);
          // Try to find by renderId in director_cut_renders as fallback
          const { error: dcUpdateError } = await supabaseAdmin
            .from('director_cut_renders')
            .update({
              status: 'completed',
              output_url: outputFile,
              error_message: null,
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('remotion_render_id', renderId);
          
          if (dcUpdateError) {
            console.error('Also failed to update director_cut_renders:', dcUpdateError);
            throw updateError;
          }
          console.log('Fallback: Updated director_cut_renders by remotion_render_id');
        } else {
          console.log('Video render marked as completed');
        }

        // Fetch full render data to save to video_creations
        const { data: renderDetails, error: fetchError } = await supabaseAdmin
          .from('video_renders')
          .select('user_id, format_config, project_id')
          .eq('render_id', renderId)
          .single();

        if (fetchError) {
          console.error('Failed to fetch render details:', fetchError);
        } else if (renderDetails) {
          // Insert into video_creations for Media Library
          const { error: insertError } = await supabaseAdmin
            .from('video_creations')
            .insert({
              user_id: renderDetails.user_id,
              output_url: outputFile,
              status: 'completed',
              metadata: {
                source: 'universal-creator',
                render_id: renderId,
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
      
    } else if (type === 'error' || type === 'timeout') {
      console.error(`Render ${renderId} failed:`, errors);
      
      const errorMessage = Array.isArray(errors) 
        ? errors.join(', ') 
        : errors?.toString() || 'Unknown error';

      if (isDirectorsCut && renderJobId) {
        // Update director_cut_renders table with error
        const { data: renderJob, error: fetchError } = await supabaseAdmin
          .from('director_cut_renders')
          .select('user_id, credits_used')
          .eq('id', renderJobId)
          .single();

        const { error: updateError } = await supabaseAdmin
          .from('director_cut_renders')
          .update({
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', renderJobId);

        if (updateError) {
          console.error('Failed to update director_cut_renders:', updateError);
          throw updateError;
        }

        // Refund credits on failure
        if (renderJob && renderJob.credits_used > 0) {
          const { error: refundError } = await supabaseAdmin.rpc('increment_balance', {
            p_user_id: renderJob.user_id,
            p_amount: renderJob.credits_used,
          });
          
          if (refundError) {
            console.error('Failed to refund credits:', refundError);
          } else {
            console.log(`✅ Refunded ${renderJob.credits_used} credits to user ${renderJob.user_id}`);
          }
        }

        console.log('Director\'s Cut render marked as failed');
      } else {
        // Original flow - Update video_renders table with error
        const { error: updateError } = await supabaseAdmin
          .from('video_renders')
          .update({
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('render_id', renderId);

        if (updateError) {
          console.error('Failed to update video_renders:', updateError);
          // Fallback to director_cut_renders
          const { error: dcUpdateError } = await supabaseAdmin
            .from('director_cut_renders')
            .update({
              status: 'failed',
              error_message: errorMessage,
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('remotion_render_id', renderId);
          
          if (dcUpdateError) {
            console.error('Also failed to update director_cut_renders:', dcUpdateError);
            throw updateError;
          }
        } else {
          console.log('Video render marked as failed');
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Webhook processed' }), 
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Webhook error:', error);
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
