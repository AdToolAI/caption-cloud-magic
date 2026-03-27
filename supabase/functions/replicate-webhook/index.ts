import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    console.log('[Replicate Webhook] Received payload:', JSON.stringify(payload, null, 2));

    const { id: predictionId, status, output, error } = payload;

    if (!predictionId) {
      console.error('[Replicate Webhook] Missing prediction ID');
      return new Response(JSON.stringify({ error: 'Missing prediction ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Find generation by artlist_job_id (which stores the Replicate prediction ID)
    const { data: generation, error: fetchError } = await supabase
      .from('ai_video_generations')
      .select('*')
      .eq('artlist_job_id', predictionId)
      .single();

    if (fetchError || !generation) {
      console.error('[Replicate Webhook] Generation not found:', predictionId, fetchError);
      return new Response(JSON.stringify({ error: 'Generation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[Replicate Webhook] Found generation:', generation.id, 'Current status:', generation.status);

    // Handle different Replicate statuses
    if (status === 'succeeded' && output) {
      // Replicate output is typically an array of URLs or a single URL
      const replicateVideoUrl = Array.isArray(output) ? output[0] : output;
      console.log('[Replicate Webhook] Video completed, downloading from:', replicateVideoUrl);

      let permanentUrl = replicateVideoUrl;

      try {
        // 1. Download video from Replicate (temporary URL)
        const videoResponse = await fetch(replicateVideoUrl);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download video: ${videoResponse.status}`);
        }
        const videoBuffer = await videoResponse.arrayBuffer();
        console.log(`[Replicate Webhook] Downloaded video: ${videoBuffer.byteLength} bytes`);

        // 2. Upload to permanent storage
        const fileName = `${generation.user_id}/${generation.id}.mp4`;
        const { error: uploadError } = await supabase.storage
          .from('ai-videos')
          .upload(fileName, videoBuffer, {
            contentType: 'video/mp4',
            upsert: true
          });

        if (uploadError) {
          console.error('[Replicate Webhook] Storage upload error:', uploadError);
          throw uploadError;
        }
        console.log('[Replicate Webhook] Video uploaded to storage:', fileName);

        // 3. Get permanent public URL
        const { data: { publicUrl } } = supabase.storage
          .from('ai-videos')
          .getPublicUrl(fileName);
        permanentUrl = publicUrl;
        console.log('[Replicate Webhook] Permanent URL:', permanentUrl);

      } catch (storageError) {
        console.error('[Replicate Webhook] Storage error, using Replicate URL as fallback:', storageError);
        // permanentUrl stays as replicateVideoUrl
      }

      // 4. Update generation as completed with permanent URL
      const { error: updateError } = await supabase
        .from('ai_video_generations')
        .update({
          status: 'completed',
          video_url: permanentUrl,
          completed_at: new Date().toISOString(),
          error_message: null
        })
        .eq('id', generation.id);

      if (updateError) {
        console.error('[Replicate Webhook] Failed to update generation:', updateError);
        throw updateError;
      }

      // 5. Auto-save to video_creations (Mediathek)
      const { error: creationError } = await supabase
        .from('video_creations')
        .insert({
          user_id: generation.user_id,
          template_id: null,
          output_url: permanentUrl,
          status: 'completed',
          metadata: {
            ai_generation_id: generation.id,
            model: generation.model,
            prompt: generation.prompt,
            aspect_ratio: generation.aspect_ratio,
            resolution: generation.resolution,
            duration_seconds: generation.duration_seconds,
            source: 'sora-2-ai'
          },
          credits_used: 0
        });

      if (creationError) {
        console.error('[Replicate Webhook] video_creations insert error:', creationError);
      } else {
        console.log('[Replicate Webhook] Video auto-saved to Mediathek');
      }

      console.log('[Replicate Webhook] Generation completed and saved:', generation.id);

      return new Response(JSON.stringify({ success: true, status: 'completed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (status === 'failed' || status === 'canceled') {
      const errorMessage = error || `Generation ${status}`;
      console.error('[Replicate Webhook] Generation failed:', errorMessage);

      // Refund credits
      console.log('[Replicate Webhook] Refunding credits:', generation.total_cost_euros);
      const { error: refundError } = await supabase.rpc('refund_ai_video_credits', {
        p_user_id: generation.user_id,
        p_amount_euros: generation.total_cost_euros,
        p_generation_id: generation.id
      });

      if (refundError) {
        console.error('[Replicate Webhook] Failed to refund credits:', refundError);
      }

      // Update generation as failed
      const { error: updateError } = await supabase
        .from('ai_video_generations')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_message: errorMessage
        })
        .eq('id', generation.id);

      if (updateError) {
        console.error('[Replicate Webhook] Failed to update generation:', updateError);
        throw updateError;
      }

      console.log('[Replicate Webhook] Generation marked as failed and credits refunded:', generation.id);

      return new Response(JSON.stringify({ success: true, status: 'failed', refunded: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // For processing/starting statuses, just acknowledge
    console.log('[Replicate Webhook] Status update:', status);
    return new Response(JSON.stringify({ success: true, status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Replicate Webhook] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
