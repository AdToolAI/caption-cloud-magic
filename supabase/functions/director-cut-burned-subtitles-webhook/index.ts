import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Replicate from "https://esm.sh/replicate@0.25.2";

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

    const { data: project, error: findError } = await supabase
      .from('director_cut_projects')
      .select('id, user_id, burned_subtitles_pass')
      .eq('burned_subtitles_prediction_id', predictionId)
      .single();

    if (findError || !project) {
      console.error('[BurnedSubsWebhook] Project not found for prediction:', predictionId);
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const currentPass = project.burned_subtitles_pass || 1;
    console.log('[BurnedSubsWebhook] Found project:', project.id, 'status:', status, 'pass:', currentPass);

    if (status === 'succeeded' && output) {
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

      // Pass 1 or 2 completed → start next pass
      if (currentPass < 3) {
        const nextPass = currentPass + 1;
        console.log(`[BurnedSubsWebhook] Pass ${currentPass} done. Starting Pass ${nextPass} with:`, cleanedVideoUrl);

        const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
        if (!REPLICATE_API_KEY) {
          console.error('[BurnedSubsWebhook] No REPLICATE_API_KEY for next pass');
          await saveCleanedVideo(supabase, project, cleanedVideoUrl);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        try {
          const replicate = new Replicate({ auth: REPLICATE_API_KEY });

          await supabase.from('director_cut_projects').update({
            burned_subtitles_pass: nextPass,
          }).eq('id', project.id);

          const webhookUrl = `${SUPABASE_URL}/functions/v1/director-cut-burned-subtitles-webhook`;

          // Pass-specific settings
          const passSettings = nextPass === 2
            ? { conf_threshold: 0.03, method: "hybrid", iou_threshold: 0.25 }
            : { conf_threshold: 0.01, method: "fast", iou_threshold: 0.2 };

          const prediction = await replicate.predictions.create({
            version: "247c8385f3c6c322110a6787bd2d257acc3a3d60b9ed7da1726a628f72a42c4d",
            input: {
              video: cleanedVideoUrl,
              method: passSettings.method,
              conf_threshold: passSettings.conf_threshold,
              margin: 20,
              resolution: "original",
              detection_interval: 1,
              iou_threshold: passSettings.iou_threshold,
            },
            webhook: webhookUrl,
            webhook_events_filter: ["completed"],
          });

          console.log(`[BurnedSubsWebhook] Pass ${nextPass} prediction created:`, prediction.id);

          await supabase.from('director_cut_projects').update({
            burned_subtitles_prediction_id: prediction.id,
          }).eq('id', project.id);

        } catch (passError) {
          console.error(`[BurnedSubsWebhook] Pass ${nextPass} failed to start:`, passError);
          await saveCleanedVideo(supabase, project, cleanedVideoUrl);
        }

      } else {
        // Pass 3 completed → save final result
        console.log('[BurnedSubsWebhook] Pass 3 done. Saving final result.');
        await saveCleanedVideo(supabase, project, cleanedVideoUrl);
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

async function saveCleanedVideo(supabase: any, project: any, cleanedVideoUrl: string) {
  try {
    console.log('[BurnedSubsWebhook] Downloading cleaned video from:', cleanedVideoUrl);
    const videoResponse = await fetch(cleanedVideoUrl);
    if (!videoResponse.ok) throw new Error(`Download failed: ${videoResponse.status}`);

    const videoBlob = await videoResponse.arrayBuffer();
    const fileName = `burned-sub-removal/cleaned-${project.user_id}-${Date.now()}.mp4`;

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

    await supabase.from('director_cut_projects').update({
      burned_subtitles_status: 'completed',
      cleaned_video_url: publicUrl,
      burned_subtitles_error: null,
    }).eq('id', project.id);

  } catch (storageError) {
    console.error('[BurnedSubsWebhook] Storage error:', storageError);
    await supabase.from('director_cut_projects').update({
      burned_subtitles_status: 'completed',
      cleaned_video_url: cleanedVideoUrl,
      burned_subtitles_error: null,
    }).eq('id', project.id);
  }
}
