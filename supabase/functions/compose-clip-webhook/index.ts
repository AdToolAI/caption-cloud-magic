import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const sceneId = url.searchParams.get('scene_id');
    const projectId = url.searchParams.get('project_id');

    if (!sceneId || !projectId) {
      throw new Error('Missing scene_id or project_id query params');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const payload = await req.json();
    console.log(`[compose-clip-webhook] Scene: ${sceneId}, Status: ${payload.status}`);

    const { id: predictionId, status, output, error: predError } = payload;

    if (status === 'succeeded' && output) {
      const videoUrl = Array.isArray(output) ? output[0] : output;
      console.log(`[compose-clip-webhook] Clip ready: ${videoUrl}`);

      // Download and store permanently
      let permanentUrl = videoUrl;
      try {
        const videoResponse = await fetch(videoUrl);
        if (videoResponse.ok) {
          const videoBuffer = await videoResponse.arrayBuffer();
          const fileName = `composer/${projectId}/${sceneId}.mp4`;

          const { error: uploadError } = await supabase.storage
            .from('ai-videos')
            .upload(fileName, videoBuffer, { contentType: 'video/mp4', upsert: true });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('ai-videos').getPublicUrl(fileName);
            permanentUrl = urlData.publicUrl;
            console.log(`[compose-clip-webhook] Stored at: ${permanentUrl}`);
          }
        }
      } catch (storageErr) {
        console.error('[compose-clip-webhook] Storage failed, using temporary URL:', storageErr);
      }

      // Update scene
      await supabase
        .from('composer_scenes')
        .update({
          clip_url: permanentUrl,
          clip_status: 'ready',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sceneId);

    } else if (status === 'failed') {
      console.error(`[compose-clip-webhook] Clip failed:`, predError);

      // Get current retry count
      const { data: scene } = await supabase
        .from('composer_scenes')
        .select('retry_count')
        .eq('id', sceneId)
        .single();

      const retryCount = (scene?.retry_count || 0) + 1;

      await supabase
        .from('composer_scenes')
        .update({
          clip_status: 'failed',
          retry_count: retryCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sceneId);

      // Refund credits for failed clip
      const { data: sceneData } = await supabase
        .from('composer_scenes')
        .select('duration_seconds, clip_source, project_id')
        .eq('id', sceneId)
        .single();

      if (sceneData) {
        const { data: project } = await supabase
          .from('composer_projects')
          .select('user_id')
          .eq('id', sceneData.project_id)
          .single();

        if (project) {
          const costPerSec = sceneData.clip_source === 'ai-kling' ? 0.15 : 0.15;
          const refundAmount = sceneData.duration_seconds * costPerSec;
          try {
            await supabase.rpc('refund_ai_video_credits', {
              p_user_id: project.user_id,
              p_amount_euros: refundAmount,
              p_generation_id: sceneId,
            });
            console.log(`[compose-clip-webhook] Refunded €${refundAmount.toFixed(2)}`);
          } catch (refundErr) {
            console.error('[compose-clip-webhook] Refund failed:', refundErr);
          }
        }
      }
    } else {
      console.log(`[compose-clip-webhook] Intermediate status: ${status}, ignoring`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if ALL scenes in this project are now done
    const { data: allScenes } = await supabase
      .from('composer_scenes')
      .select('clip_status, clip_source')
      .eq('project_id', projectId);

    if (allScenes) {
      const allDone = allScenes.every(
        s => s.clip_status === 'ready' || s.clip_status === 'failed' || s.clip_source === 'upload'
      );

      if (allDone) {
        const allReady = allScenes.every(
          s => s.clip_status === 'ready' || s.clip_source === 'upload'
        );

        await supabase
          .from('composer_projects')
          .update({
            status: allReady ? 'preview' : 'storyboard',
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId);

        console.log(`[compose-clip-webhook] Project ${projectId} all clips done. Status: ${allReady ? 'preview' : 'storyboard'}`);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[compose-clip-webhook] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
