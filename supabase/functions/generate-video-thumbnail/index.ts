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

    const { project_id, video_url, user_id } = await req.json();

    console.log(`📸 Generating thumbnail for project: ${project_id}`);

    // For now, we'll use a placeholder thumbnail generation
    // In production, you could use FFmpeg via a separate service or Shotstack
    const shotstackApiKey = Deno.env.get('SHOTSTACK_API_KEY');
    
    if (!shotstackApiKey) {
      console.warn('⚠️ SHOTSTACK_API_KEY not configured, using placeholder thumbnails');
      
      // Create placeholder thumbnail URLs
      const thumbnailUrls = {
        small: `${video_url}#t=2`, // Video poster frame
        medium: `${video_url}#t=2`,
        large: `${video_url}#t=2`
      };
      
      await supabase
        .from('content_projects')
        .update({ thumbnail_urls: thumbnailUrls })
        .eq('id', project_id);

      return new Response(
        JSON.stringify({ 
          success: true,
          thumbnail_urls: thumbnailUrls,
          message: 'Using video poster frames as thumbnails'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate thumbnail using Shotstack
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
                length: 0.1,
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
          capture: 2.0 // Capture at 2 seconds
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
      throw new Error(`Shotstack API error: ${errorData.message}`);
    }

    const thumbnailData = await thumbnailResponse.json();
    const renderId = thumbnailData.response.id;

    console.log(`⏳ Waiting for thumbnail render: ${renderId}`);

    // Poll for completion (max 30 seconds)
    let attempts = 0;
    let thumbnailUrl: string | null = null;

    while (attempts < 6 && !thumbnailUrl) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;

      const statusResponse = await fetch(
        `https://api.shotstack.io/v1/render/${renderId}`,
        { headers: { 'x-api-key': shotstackApiKey } }
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

    // Create thumbnail URLs for different sizes (using the same URL for now)
    const thumbnailUrls = {
      small: thumbnailUrl,
      medium: thumbnailUrl,
      large: thumbnailUrl
    };

    // Update project with thumbnail URLs
    await supabase
      .from('content_projects')
      .update({ thumbnail_urls: thumbnailUrls })
      .eq('id', project_id);

    // Track storage file
    await supabase
      .from('storage_files')
      .insert({
        user_id,
        bucket_name: 'thumbnails',
        file_path: `${user_id}/${project_id}/thumb.jpg`,
        file_size_mb: 0.1, // Estimate
        file_type: 'image/jpeg',
        project_id
      });

    return new Response(
      JSON.stringify({
        success: true,
        thumbnail_urls: thumbnailUrls
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
