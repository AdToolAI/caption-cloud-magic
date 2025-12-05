import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');
    
    const supabaseClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');

    const { projectId, sceneIds } = await req.json();
    if (!projectId) throw new Error('Missing projectId');

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    // Fetch scenes that are in 'generating' status
    let query = supabaseAdmin
      .from('sora_long_form_scenes')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'generating')
      .not('replicate_prediction_id', 'is', null);
    
    if (sceneIds?.length) {
      query = query.in('id', sceneIds);
    }

    const { data: scenes, error: fetchError } = await query;
    if (fetchError) throw new Error(`Failed to fetch scenes: ${fetchError.message}`);
    
    if (!scenes?.length) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No generating scenes found',
        updated: 0 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log(`[check-sora-scene-status] Checking ${scenes.length} scenes for project ${projectId}`);

    const results = [];
    
    for (const scene of scenes) {
      try {
        // Query Replicate for the prediction status
        const prediction = await replicate.predictions.get(scene.replicate_prediction_id);
        console.log(`[check-sora-scene-status] Scene ${scene.id}: Replicate status = ${prediction.status}`);
        
        if (prediction.status === 'succeeded') {
          // Get the video URL from the output
          const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
          
          // Update scene as completed
          await supabaseAdmin
            .from('sora_long_form_scenes')
            .update({
              status: 'completed',
              generated_video_url: videoUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', scene.id);
          
          // Save to media library
          await supabaseAdmin.from('video_creations').insert({
            user_id: user.id,
            title: `Sora Long-Form Szene ${scene.scene_order}`,
            prompt: scene.prompt,
            video_url: videoUrl,
            duration: scene.duration,
            aspect_ratio: '16:9',
            model: 'sora-2',
            source: 'sora-long-form',
          });
          
          results.push({ sceneId: scene.id, status: 'completed', videoUrl });
          console.log(`[check-sora-scene-status] Scene ${scene.id} marked as completed`);
          
        } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
          // Update scene as failed
          await supabaseAdmin
            .from('sora_long_form_scenes')
            .update({
              status: 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', scene.id);
          
          // Refund credits
          try {
            await supabaseAdmin.functions.invoke('credit-refund', {
              body: {
                userId: user.id,
                amount: scene.duration * 25, // Standard rate
                reason: 'Sora scene generation failed',
              },
            });
          } catch (refundErr) {
            console.error(`[check-sora-scene-status] Refund failed for scene ${scene.id}:`, refundErr);
          }
          
          results.push({ sceneId: scene.id, status: 'failed', error: prediction.error });
          console.log(`[check-sora-scene-status] Scene ${scene.id} marked as failed`);
          
        } else {
          // Still processing (starting, processing)
          results.push({ sceneId: scene.id, status: prediction.status });
        }
        
      } catch (err: any) {
        console.error(`[check-sora-scene-status] Error checking scene ${scene.id}:`, err);
        results.push({ sceneId: scene.id, status: 'error', error: err?.message || 'Unknown error' });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      results,
      updated: results.filter(r => r.status === 'completed' || r.status === 'failed').length,
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    console.error('[check-sora-scene-status] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error?.message || 'Unknown error'
    }), {
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
