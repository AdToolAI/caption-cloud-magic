import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { video_url } = await req.json();
    if (!video_url) {
      return new Response(JSON.stringify({ error: 'video_url is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[RemoveBurnedSubs] Starting for user:', user.id, 'video:', video_url);

    // Use Replicate video-text-remover model
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    console.log('[RemoveBurnedSubs] Calling video-text-remover model...');

    const output = await replicate.run(
      "hjunior29/video-text-remover",
      {
        input: {
          video: video_url,
          method: "hybrid",
          conf_threshold: 0.25,
          margin: 5,
        },
      }
    );

    console.log('[RemoveBurnedSubs] Model output:', typeof output, output);

    // Get the output URL
    let cleanedVideoUrl: string;
    if (typeof output === 'string') {
      cleanedVideoUrl = output;
    } else if (Array.isArray(output) && output.length > 0) {
      cleanedVideoUrl = output[0];
    } else if (output && typeof output === 'object' && 'output' in output) {
      cleanedVideoUrl = (output as any).output;
    } else {
      throw new Error('Unexpected model output format: ' + JSON.stringify(output));
    }

    // Upload cleaned video to Supabase Storage
    console.log('[RemoveBurnedSubs] Downloading cleaned video from:', cleanedVideoUrl);

    const videoResponse = await fetch(cleanedVideoUrl);
    if (!videoResponse.ok) throw new Error('Failed to download cleaned video');

    const videoBlob = await videoResponse.arrayBuffer();
    const fileName = `cleaned-${user.id}-${Date.now()}.mp4`;
    const storagePath = `burned-sub-removal/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('video-assets')
      .upload(storagePath, videoBlob, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) {
      console.error('[RemoveBurnedSubs] Upload error:', uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('video-assets')
      .getPublicUrl(storagePath);

    console.log('[RemoveBurnedSubs] Success! Cleaned video at:', publicUrl);

    return new Response(JSON.stringify({
      success: true,
      cleaned_video_url: publicUrl,
      message: 'Eingebrannte Untertitel erfolgreich entfernt',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[RemoveBurnedSubs] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
