import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PEXELS_API_KEY = 'fkjJRzjEDQXPBZU5L96FMgCmfp0v4RbyXKqpqcCn7BjkkXyYGCXgYXxu';

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  image: string;
  video_files: Array<{
    id: number;
    quality: string;
    file_type: string;
    width: number;
    height: number;
    link: string;
  }>;
  video_pictures: Array<{
    id: number;
    picture: string;
  }>;
  user: {
    name: string;
    url: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, perPage = 15, page = 1 } = await req.json();
    
    console.log('Searching Pexels for:', query);

    if (!query) {
      throw new Error('Search query is required');
    }

    // Search Pexels API
    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`,
      {
        headers: {
          'Authorization': PEXELS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Pexels API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform Pexels data to our format
    const videos = data.videos.map((video: PexelsVideo) => {
      // Find HD video file (prefer 1920x1080)
      const hdVideo = video.video_files.find(
        (file) => file.quality === 'hd' && file.width === 1920
      ) || video.video_files.find(
        (file) => file.quality === 'hd'
      ) || video.video_files[0];

      return {
        id: video.id,
        url: hdVideo.link,
        thumbnail_url: video.image,
        width: video.width,
        height: video.height,
        duration_sec: video.duration,
        user: {
          name: video.user.name,
          url: video.user.url,
        },
        source: 'pexels',
      };
    });

    console.log(`Found ${videos.length} videos`);

    return new Response(
      JSON.stringify({ videos, total: data.total_results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error searching stock videos:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
