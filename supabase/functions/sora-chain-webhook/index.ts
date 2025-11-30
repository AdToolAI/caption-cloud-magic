import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SORA_MODELS = {
  'sora-2-standard': '96d31e18e9da8d72ce794ebe800c459814e83508cf95230744c5139e089e2331',
  'sora-2-pro': '4b88384943c04009e691011b2e42f9c7a7fe2c67036a68d6e9af153eb8210d1f',
};

// Extract last frame from video using Replicate's video-splitter model
async function extractLastFrame(
  videoUrl: string, 
  replicate: any, 
  supabase: any,
  projectId: string,
  sceneOrder: number
): Promise<string | null> {
  try {
    console.log('[Chain Webhook] Extracting last frame from:', videoUrl);
    
    // Use video-splitter model to extract frames
    // This model extracts frames from video at specified intervals
    const output = await replicate.run(
      "fofr/video-splitter:8a4bed932e25e908f192d9e19702e99e5f2e8561c5e3f1c55b4b3c1b6e8f8f8f",
      {
        input: {
          video: videoUrl,
          frame_rate: 1, // 1 frame per second - we only need the last one
          output_format: "jpg"
        }
      }
    );

    console.log('[Chain Webhook] Frame extraction output:', output);

    // Get the last frame from the output array
    if (Array.isArray(output) && output.length > 0) {
      const lastFrameUrl = output[output.length - 1];
      console.log('[Chain Webhook] ✅ Extracted last frame:', lastFrameUrl);
      
      // Download and upload to Supabase Storage for persistence
      try {
        const frameResponse = await fetch(lastFrameUrl);
        if (frameResponse.ok) {
          const frameBlob = await frameResponse.blob();
          const fileName = `${projectId}/scene-${sceneOrder}-last-frame-${Date.now()}.jpg`;
          
          const { error: uploadError } = await supabase.storage
            .from('sora-frames')
            .upload(fileName, frameBlob, { 
              contentType: 'image/jpeg',
              upsert: true 
            });

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('sora-frames')
              .getPublicUrl(fileName);
            
            console.log('[Chain Webhook] ✅ Frame stored in Supabase:', publicUrl);
            return publicUrl;
          }
        }
      } catch (storageError) {
        console.log('[Chain Webhook] Storage upload failed, using Replicate URL:', storageError);
      }
      
      // Return Replicate URL if storage fails
      return lastFrameUrl;
    }

    console.log('[Chain Webhook] ⚠️ No frames extracted, falling back to null');
    return null;
  } catch (error) {
    console.error('[Chain Webhook] Frame extraction error:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY')!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const replicate = new Replicate({ auth: REPLICATE_API_KEY });

  try {
    const payload = await req.json();
    console.log("[Chain Webhook] Received:", JSON.stringify(payload, null, 2));

    const { id: predictionId, status, output, error: predictionError } = payload;

    // Find the scene by prediction ID with retry mechanism (race condition fix)
    const maxRetries = 5;
    const retryDelay = 2000; // 2 seconds
    let scene: any = null;
    let fetchError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const { data, error } = await supabase
        .from('sora_long_form_scenes')
        .select('*, sora_long_form_projects!inner(id, user_id, model, script)')
        .eq('replicate_prediction_id', predictionId)
        .single();
      
      if (data && !error) {
        scene = data;
        fetchError = null;
        console.log(`[Chain Webhook] Scene found on attempt ${attempt}`);
        break;
      }
      
      fetchError = error;
      
      if (attempt < maxRetries) {
        console.log(`[Chain Webhook] Scene not found (attempt ${attempt}/${maxRetries}), retrying in ${retryDelay}ms...`);
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }

    if (fetchError || !scene) {
      console.error("[Chain Webhook] Scene not found after all retries:", predictionId);
      return new Response(JSON.stringify({ error: "Scene not found", predictionId }), 
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const project = scene.sora_long_form_projects;
    let chainData: any = {};
    
    try {
      chainData = project.script ? JSON.parse(project.script) : {};
    } catch (e) {
      console.log('[Chain Webhook] No chain data in script field');
    }

    const isChainGeneration = chainData.chain_active === true;
    console.log(`[Chain Webhook] Scene ${scene.scene_order}, Chain active: ${isChainGeneration}`);

    if (status === "succeeded" && output) {
      const videoUrl = Array.isArray(output) ? output[0] : output;
      
      // Update scene as completed
      await supabase.from('sora_long_form_scenes').update({ 
        status: 'completed', 
        generated_video_url: videoUrl 
      }).eq('id', scene.id);

      console.log(`[Chain Webhook] ✅ Scene ${scene.scene_order} completed: ${videoUrl}`);

      // ✅ Sofort in Mediathek (video_creations) speichern
      const { error: mediaError } = await supabase.from('video_creations').insert({
        user_id: project.user_id,
        output_url: videoUrl,
        status: 'completed',
        metadata: {
          source: 'sora-2-longform',
          project_id: project.id,
          scene_id: scene.id,
          scene_order: scene.scene_order,
          prompt: scene.prompt,
          duration: scene.duration,
          model: chainData.model || project.model,
        }
      });
      
      if (mediaError) {
        console.error(`[Chain Webhook] ⚠️ Failed to save to media library:`, mediaError);
      } else {
        console.log(`[Chain Webhook] ✅ Scene ${scene.scene_order} saved to media library`);
      }

      // Check if there are remaining scenes in the chain
      const remainingSceneIds = chainData.remaining_scene_ids || [];
      
      if (isChainGeneration && remainingSceneIds.length > 0) {
        // Get next scene
        const nextSceneId = remainingSceneIds[0];
        const updatedRemainingIds = remainingSceneIds.slice(1);

        const { data: nextScene, error: nextSceneError } = await supabase
          .from('sora_long_form_scenes')
          .select('*')
          .eq('id', nextSceneId)
          .single();

        if (nextScene && !nextSceneError) {
          console.log(`[Chain Webhook] Starting next scene ${nextScene.scene_order}/${remainingSceneIds.length + 1}`);

          // Extract last frame from completed video as reference for next scene
          const referenceImageUrl = await extractLastFrame(
            videoUrl, 
            replicate, 
            supabase,
            project.id,
            scene.scene_order
          );

          console.log(`[Chain Webhook] Reference for next scene: ${referenceImageUrl || 'none (text-to-video)'}`);

          // Start next scene
          const webhookUrl = `${SUPABASE_URL}/functions/v1/sora-chain-webhook`;
          
          const aspectRatio = chainData.aspect_ratio || '16:9';
          const replicateAspectRatio = aspectRatio === '9:16' ? 'portrait' : aspectRatio === '1:1' ? 'square' : 'landscape';

          const input: Record<string, any> = {
            prompt: nextScene.prompt,
            duration: nextScene.duration || 8,
            aspect_ratio: replicateAspectRatio,
          };

          // Add reference image if extraction succeeded (Image-to-Video)
          if (referenceImageUrl) {
            input.image_url = referenceImageUrl;
            console.log(`[Chain Webhook] 🖼️ Using Image-to-Video with reference: ${referenceImageUrl}`);
          } else {
            console.log(`[Chain Webhook] 📝 Using Text-to-Video (no reference)`);
          }

          try {
            const prediction = await replicate.predictions.create({
              version: SORA_MODELS[chainData.model as keyof typeof SORA_MODELS] || SORA_MODELS['sora-2-standard'],
              input,
              webhook: webhookUrl,
              webhook_events_filter: ['completed']
            });

            // Update next scene status
            await supabase.from('sora_long_form_scenes').update({
              status: 'generating',
              replicate_prediction_id: prediction.id,
              reference_image_url: referenceImageUrl, // Store the extracted frame URL
            }).eq('id', nextSceneId);

            // Update chain metadata
            await supabase.from('sora_long_form_projects').update({
              script: JSON.stringify({
                ...chainData,
                remaining_scene_ids: updatedRemainingIds,
              })
            }).eq('id', project.id);

            console.log(`[Chain Webhook] ✅ Scene ${nextScene.scene_order} started: ${prediction.id}`);
            console.log(`[Chain Webhook] Remaining: ${updatedRemainingIds.length} scenes`);

          } catch (replicateError: any) {
            console.error('[Chain Webhook] Failed to start next scene:', replicateError);
            
            // Refund remaining scenes cost
            const costPerSecond = chainData.cost_per_second || 0.25;
            const remainingDuration = remainingSceneIds.reduce((sum: number, id: string) => {
              return sum + 8; // Estimate 8 seconds per remaining scene
            }, 0);
            const refundAmount = remainingDuration * costPerSecond;

            if (refundAmount > 0 && chainData.user_id) {
              await supabase.rpc('refund_ai_video_credits', {
                p_user_id: chainData.user_id,
                p_amount_euros: refundAmount,
                p_generation_id: project.id
              });
              console.log(`[Chain Webhook] Refunded ${refundAmount} for remaining scenes`);
            }

            // Mark remaining scenes as failed
            await supabase.from('sora_long_form_scenes')
              .update({ status: 'failed' })
              .in('id', remainingSceneIds);
          }
        }
      } else {
        // No more scenes - check if all done
        const { data: allScenes } = await supabase
          .from('sora_long_form_scenes')
          .select('status')
          .eq('project_id', project.id);

        const allCompleted = allScenes?.every(s => s.status === 'completed');
        
        if (allCompleted) {
          // Clear chain data and mark as complete
          await supabase.from('sora_long_form_projects').update({ 
            status: 'draft',
            script: null, // Clear chain metadata
          }).eq('id', project.id);
          console.log(`[Chain Webhook] 🎉 All scenes completed for project ${project.id}`);
        }
      }

    } else if (status === "failed") {
      await supabase.from('sora_long_form_scenes').update({ status: 'failed' }).eq('id', scene.id);
      console.error(`[Chain Webhook] ❌ Scene ${scene.scene_order} failed:`, predictionError);

      // Refund this scene's cost
      const sceneDuration = scene.duration || 8;
      const costPerSecond = chainData.cost_per_second || 0.25;
      const refundAmount = sceneDuration * costPerSecond;
      const userId = chainData.user_id || project.user_id;

      if (refundAmount > 0 && userId) {
        const { error: refundError } = await supabase.rpc('refund_ai_video_credits', {
          p_user_id: userId,
          p_amount_euros: refundAmount,
          p_generation_id: scene.id
        });

        if (!refundError) {
          console.log(`[Chain Webhook] ✅ Refunded ${refundAmount} for failed scene ${scene.scene_order}`);
        }
      }

      // Also refund remaining scenes if chain generation
      const remainingSceneIds = chainData.remaining_scene_ids || [];
      if (isChainGeneration && remainingSceneIds.length > 0) {
        // Get remaining scenes to calculate refund
        const { data: remainingScenes } = await supabase
          .from('sora_long_form_scenes')
          .select('duration')
          .in('id', remainingSceneIds);

        const remainingDuration = remainingScenes?.reduce((sum, s) => sum + (s.duration || 8), 0) || 0;
        const remainingRefund = remainingDuration * costPerSecond;

        if (remainingRefund > 0 && userId) {
          await supabase.rpc('refund_ai_video_credits', {
            p_user_id: userId,
            p_amount_euros: remainingRefund,
            p_generation_id: project.id
          });
          console.log(`[Chain Webhook] ✅ Refunded ${remainingRefund} for ${remainingSceneIds.length} remaining scenes`);
        }

        // Mark remaining as failed
        await supabase.from('sora_long_form_scenes')
          .update({ status: 'failed' })
          .in('id', remainingSceneIds);
      }

      // Check project status
      const { data: allScenes } = await supabase
        .from('sora_long_form_scenes')
        .select('status')
        .eq('project_id', project.id);

      const allDone = allScenes?.every(s => s.status === 'completed' || s.status === 'failed');
      const allFailed = allScenes?.every(s => s.status === 'failed');

      if (allDone) {
        await supabase.from('sora_long_form_projects').update({ 
          status: allFailed ? 'failed' : 'draft',
          script: null,
        }).eq('id', project.id);
      }
    }

    return new Response(JSON.stringify({ success: true }), 
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[Chain Webhook] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
