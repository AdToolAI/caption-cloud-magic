import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { video_creation_id, video_url, timestamp_sec = 1.0 } = await req.json();

    console.log(`📸 Generating thumbnail for video: ${video_creation_id}`);

    // For now, we'll use Shotstack's thumbnail generation API
    // In production, you could use FFmpeg via a separate service
    const shotstackApiKey = Deno.env.get('SHOTSTACK_API_KEY');
    
    if (!shotstackApiKey) {
      console.warn('⚠️ SHOTSTACK_API_KEY not configured, skipping thumbnail generation');
      return new Response(
        JSON.stringify({ 
          success: false,
          message: 'Thumbnail service not configured'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create thumbnail using Shotstack
    const thumbnailConfig = {
      timeline: {
        background: "#000000",
        tracks: [
          {
            clips: [
              {
                asset: {
                  type: "video",
                  src: video_url
                },
                start: 0,
                length: 0.1, // Just capture one frame
                offset: {
                  x: 0,
                  y: 0
                }
              }
            ]
          }
        ]
      },
      output: {
        format: "jpg",
        resolution: "hd",
        poster: {
          capture: timestamp_sec
        }
      }
    };

    const thumbnailResponse = await fetch('https://api.shotstack.io/v1/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': shotstackApiKey
      },
      body: JSON.stringify(thumbnailConfig)
    });

    if (!thumbnailResponse.ok) {
      const errorData = await thumbnailResponse.json();
      throw new Error(`Shotstack thumbnail API error: ${errorData.message}`);
    }

    const thumbnailData = await thumbnailResponse.json();
    const thumbnailRenderId = thumbnailData.response.id;

    console.log(`⏳ Waiting for thumbnail render: ${thumbnailRenderId}`);

    // Poll for thumbnail completion (max 30 seconds)
    let attempts = 0;
    let thumbnailUrl: string | null = null;

    while (attempts < 6 && !thumbnailUrl) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;

      const statusResponse = await fetch(
        `https://api.shotstack.io/v1/render/${thumbnailRenderId}`,
        {
          headers: { 'x-api-key': shotstackApiKey }
        }
      );

      const statusData = await statusResponse.json();

      if (statusData.response.status === 'done') {
        thumbnailUrl = statusData.response.url;
        break;
      } else if (statusData.response.status === 'failed') {
        throw new Error('Thumbnail generation failed');
      }
    }

    if (!thumbnailUrl) {
      throw new Error('Thumbnail generation timeout');
    }

    console.log(`✅ Thumbnail generated: ${thumbnailUrl}`);

    // Update video_creations with thumbnail URL
    await supabase
      .from('video_creations')
      .update({
        thumbnail_url: thumbnailUrl,
        thumbnail_timestamp_sec: timestamp_sec,
        custom_thumbnail_uploaded: false
      })
      .eq('id', video_creation_id);

    return new Response(
      JSON.stringify({
        success: true,
        thumbnail_url: thumbnailUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error generating thumbnail:', error);
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
