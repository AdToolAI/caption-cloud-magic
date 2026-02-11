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
    console.log('🔔 Remotion webhook received');
    console.log('Request headers:', JSON.stringify(Object.fromEntries(req.headers.entries())));
    
    // Parse webhook payload
    const payload = await req.json();
    console.log('📦 Webhook payload:', JSON.stringify(payload, null, 2));

    const { type, renderId, outputFile, errors, bucketName, customData } = payload;

    // Create admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Extract customData fields
    const pendingRenderId = customData?.pending_render_id;
    const outName = customData?.out_name;
    const userId = customData?.user_id;
    const projectId = customData?.project_id;
    const creditsUsed = customData?.credits_used;
    const source = customData?.source;
    const isDirectorsCut = source === 'directors-cut';
    const renderJobId = customData?.render_job_id;

    console.log(`📋 Webhook details:`, {
      type,
      renderId,
      pendingRenderId,
      outName,
      userId,
      isDirectorsCut,
      outputFile: outputFile?.substring(0, 100)
    });

    // Handle different webhook types
    if (type === 'success') {
      console.log(`✅ Render ${renderId} completed successfully`);
      
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

        console.log("✅ Director's Cut render marked as completed");

        // Save to video_creations for Media Library
        if (userId) {
          const { data: existing } = await supabaseAdmin
            .from('video_creations')
            .select('id')
            .eq('user_id', userId)
            .eq('output_url', outputFile)
            .maybeSingle();

          if (!existing) {
            await supabaseAdmin
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
            console.log('✅ Director\'s Cut video saved to Media Library');
          }
        }
      } else {
        // ============================================
        // ✅ UNIVERSAL CREATOR FLOW - Match by pending_render_id
        // ============================================
        
        // First try to match by pendingRenderId from customData
        if (pendingRenderId) {
          console.log('🔍 Looking for pending render by customData.pending_render_id:', pendingRenderId);
          
          const { data: existingRender, error: lookupError } = await supabaseAdmin
            .from('video_renders')
            .select('*')
            .eq('render_id', pendingRenderId)
            .maybeSingle();
          
          if (lookupError) {
            console.error('Lookup error:', lookupError);
          }
          
          if (existingRender) {
            console.log('✅ Found pending render, updating with real data');
            
            const { error: updateError } = await supabaseAdmin
              .from('video_renders')
              .update({
                status: 'completed',
                video_url: outputFile,
                error_message: null,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('render_id', pendingRenderId);

            if (updateError) {
              console.error('Failed to update video_renders:', updateError);
              throw updateError;
            }

            console.log('✅ Video render marked as completed');

            // Save to video_creations for Media Library
            if (existingRender.user_id) {
              const { data: existingVideo } = await supabaseAdmin
                .from('video_creations')
                .select('id')
                .eq('output_url', outputFile)
                .maybeSingle();

              if (!existingVideo) {
                await supabaseAdmin
                  .from('video_creations')
                  .insert({
                    user_id: existingRender.user_id,
                    output_url: outputFile,
                    status: 'completed',
                    metadata: {
                      source: 'universal-creator',
                      render_id: renderId,
                      pending_render_id: pendingRenderId,
                      format_config: existingRender.format_config,
                      project_id: existingRender.project_id
                    }
                  });
                console.log('✅ Video saved to Media Library');
              }
            }

            // Update project status if applicable
            if (existingRender.project_id) {
              await supabaseAdmin
                .from('content_projects')
                .update({ status: 'completed' })
                .eq('id', existingRender.project_id);
              console.log('✅ Project status updated to completed');
            }

            // ✅ Update universal_video_progress to completed
            try {
              const { data: progressEntries } = await supabaseAdmin
                .from('universal_video_progress')
                .select('id, result_data')
                .eq('status', 'rendering')
                .limit(10);

              if (progressEntries) {
                for (const entry of progressEntries) {
                  const resultData = entry.result_data as any;
                  if (resultData?.renderId === pendingRenderId) {
                    await supabaseAdmin.from('universal_video_progress').update({
                      status: 'completed',
                      progress_percent: 100,
                      current_step: 'completed',
                      result_data: { ...resultData, outputUrl: outputFile },
                    }).eq('id', entry.id);
                    console.log('✅ universal_video_progress set to completed for:', entry.id);
                    break;
                  }
                }
              }
            } catch (progressError) {
              console.error('⚠️ Failed to update universal_video_progress:', progressError);
            }
          } else {
            console.log('⚠️ No pending render found with ID:', pendingRenderId);
            
            // Fallback: Try to find by real renderId
            const { error: directUpdateError } = await supabaseAdmin
              .from('video_renders')
              .update({
                status: 'completed',
                video_url: outputFile,
                error_message: null,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('render_id', renderId);

            if (directUpdateError) {
              console.error('Direct update also failed:', directUpdateError);
            } else {
              console.log('✅ Updated by real renderId as fallback');
            }
          }
        } else {
          // No customData - legacy flow, try direct renderId match
          console.log('⚠️ No customData.pending_render_id, using direct renderId:', renderId);
          
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
            
            // Try director_cut_renders as fallback
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
        }
      }
      
    } else if (type === 'error' || type === 'timeout') {
      console.error(`❌ Render ${renderId} failed:`, errors);
      
      const errorMessage = Array.isArray(errors) 
        ? errors.map(e => typeof e === 'object' ? (e.message || JSON.stringify(e)) : String(e)).join(', ')
        : (typeof errors === 'object' ? (errors?.message || JSON.stringify(errors)) : (errors?.toString() || 'Unknown error'));

      if (isDirectorsCut && renderJobId) {
        // Update director_cut_renders table with error
        const { data: renderJob } = await supabaseAdmin
          .from('director_cut_renders')
          .select('user_id, credits_used')
          .eq('id', renderJobId)
          .single();

        await supabaseAdmin
          .from('director_cut_renders')
          .update({
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', renderJobId);

        // Refund credits on failure
        if (renderJob && renderJob.credits_used > 0) {
          await supabaseAdmin.rpc('increment_balance', {
            p_user_id: renderJob.user_id,
            p_amount: renderJob.credits_used,
          });
          console.log(`✅ Refunded ${renderJob.credits_used} credits`);
        }

        console.log("Director's Cut render marked as failed");
      } else {
        // ============================================
        // ✅ UNIVERSAL CREATOR FAILURE HANDLING
        // ============================================
        
        if (pendingRenderId) {
          console.log('🔍 Looking for pending render to mark as failed:', pendingRenderId);
          
          const { data: existingRender } = await supabaseAdmin
            .from('video_renders')
            .select('user_id, project_id')
            .eq('render_id', pendingRenderId)
            .maybeSingle();
          
          await supabaseAdmin
            .from('video_renders')
            .update({
              status: 'failed',
              error_message: errorMessage,
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('render_id', pendingRenderId);

          // Refund credits
          if (creditsUsed && userId) {
            await supabaseAdmin.rpc('increment_balance', {
              p_user_id: userId,
              p_amount: creditsUsed,
            });
            console.log(`✅ Refunded ${creditsUsed} credits to user`);
          }

          // Update project status
          if (existingRender?.project_id) {
            await supabaseAdmin
              .from('content_projects')
              .update({ status: 'failed', error_message: errorMessage })
              .eq('id', existingRender.project_id);
          }

          console.log('❌ Video render marked as failed');
        } else {
          // Legacy flow
          await supabaseAdmin
            .from('video_renders')
            .update({
              status: 'failed',
              error_message: errorMessage,
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('render_id', renderId);
          
          console.log('Video render marked as failed (legacy)');
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
