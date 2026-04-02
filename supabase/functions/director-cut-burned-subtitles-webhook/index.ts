import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload = await req.json();
    console.log('[BurnedSubsWebhook] Received:', JSON.stringify(payload, null, 2));

    const { id: predictionId, status, output, error: replicateError } = payload;

    // Find project by prediction ID
    const { data: project, error: findError } = await supabase
      .from('director_cut_projects')
      .select('id, user_id')
      .eq('burned_subtitles_prediction_id', predictionId)
      .single();

    if (findError || !project) {
      console.error('[BurnedSubsWebhook] Project not found for prediction:', predictionId);
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[BurnedSubsWebhook] Found project:', project.id, 'status:', status);

    if (status === 'succeeded' && output) {
      // Normalize output URL
      let cleanedVideoUrl: string;
      if (typeof output === 'string') {
        cleanedVideoUrl = output;
      } else if (Array.isArray(output) && output.length > 0) {
        cleanedVideoUrl = output[0];
      } else if (output && typeof output === 'object' && 'output' in output) {
        cleanedVideoUrl = (output as any).output;
      } else {
        console.error('[BurnedSubsWebhook] Unexpected output format:', output);
        await supabase.from('director_cut_projects').update({
          burned_subtitles_status: 'failed',
          burned_subtitles_error: 'Unerwartetes Ausgabeformat vom KI-Modell',
        }).eq('id', project.id);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        // Download cleaned video
        console.log('[BurnedSubsWebhook] Downloading cleaned video from:', cleanedVideoUrl);
        const videoResponse = await fetch(cleanedVideoUrl);
        if (!videoResponse.ok) throw new Error(`Download failed: ${videoResponse.status}`);

        const videoBlob = await videoResponse.arrayBuffer();
        const fileName = `burned-sub-removal/cleaned-${project.user_id}-${Date.now()}.mp4`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('video-assets')
          .upload(fileName, videoBlob, {
            contentType: 'video/mp4',
            upsert: true,
          });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        const { data: { publicUrl } } = supabase.storage
          .from('video-assets')
          .getPublicUrl(fileName);

        console.log('[BurnedSubsWebhook] Success! Stored at:', publicUrl);

        // Update project
        await supabase.from('director_cut_projects').update({
          burned_subtitles_status: 'completed',
          cleaned_video_url: publicUrl,
          burned_subtitles_error: null,
        }).eq('id', project.id);

      } catch (storageError) {
        console.error('[BurnedSubsWebhook] Storage error:', storageError);
        // Fallback: use Replicate URL directly
        await supabase.from('director_cut_projects').update({
          burned_subtitles_status: 'completed',
          cleaned_video_url: cleanedVideoUrl,
          burned_subtitles_error: null,
        }).eq('id', project.id);
      }

    } else if (status === 'failed') {
      console.error('[BurnedSubsWebhook] Prediction failed:', replicateError);
      await supabase.from('director_cut_projects').update({
        burned_subtitles_status: 'failed',
        burned_subtitles_error: replicateError || 'KI-Verarbeitung fehlgeschlagen',
      }).eq('id', project.id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[BurnedSubsWebhook] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
