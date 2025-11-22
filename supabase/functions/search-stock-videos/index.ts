import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PixabayVideo {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  duration: number;
  picture_id: string;
  videos: {
    large?: { url: string; width: number; height: number; size: number; thumbnail: string };
    medium?: { url: string; width: number; height: number; size: number; thumbnail: string };
    small?: { url: string; width: number; height: number; size: number; thumbnail: string };
    tiny?: { url: string; width: number; height: number; size: number; thumbnail: string };
  };
  user: string;
  userImageURL: string;
}

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

interface TransformedVideo {
  id: string | number;
  url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  duration_sec: number;
  user: {
    name: string;
    url: string;
  };
  source: 'pixabay' | 'pexels';
}

async function searchPixabay(query: string, perPage: number = 15): Promise<TransformedVideo[]> {
  try {
    const pixabayApiKey = Deno.env.get('PIXABAY_API_KEY');
    
    if (!pixabayApiKey) {
      console.log('No Pixabay API key configured, skipping Pixabay search');
      return [];
    }
    
    const url = `https://pixabay.com/api/videos/?key=${pixabayApiKey}&q=${encodeURIComponent(query)}&per_page=${perPage}`;
    
    console.log('Searching Pixabay for:', query);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pixabay API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 200),
        query: query
      });
      return [];
    }
    
    const data = await response.json();
    
    if (!data.hits || data.hits.length === 0) {
      console.log('No Pixabay results found');
      return [];
    }
    
    const videos = data.hits.map((video: PixabayVideo) => {
      // Prefer large, fallback to medium, then small
      const videoFile = video.videos.large || video.videos.medium || video.videos.small || video.videos.tiny;
      
      return {
        id: `pixabay-${video.id}`,
        url: videoFile?.url || '',
        thumbnail_url: videoFile?.thumbnail || `https://i.vimeocdn.com/video/${video.picture_id}_640x360.jpg`,
        width: videoFile?.width || 1920,
        height: videoFile?.height || 1080,
        duration_sec: video.duration,
        user: {
          name: video.user || 'Pixabay User',
          url: video.pageURL,
        },
        source: 'pixabay' as const,
      };
    });
    
    console.log(`Found ${videos.length} Pixabay videos`);
    return videos;
  } catch (error) {
    console.error('Pixabay search error:', error);
    return [];
  }
}

async function searchPexels(query: string, perPage: number = 15): Promise<TransformedVideo[]> {
  try {
    const pexelsApiKey = Deno.env.get('PEXELS_API_KEY');
    
    if (!pexelsApiKey) {
      console.log('No Pexels API key configured, skipping Pexels search');
      return [];
    }
    
    console.log('Searching Pexels for:', query);
    
    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=1`,
      {
        headers: {
          'Authorization': pexelsApiKey,
        },
      }
    );

    if (!response.ok) {
      console.error('Pexels API error:', response.status);
      return [];
    }

    const data = await response.json();
    
    if (!data.videos || data.videos.length === 0) {
      console.log('No Pexels results found');
      return [];
    }
    
    const videos = data.videos.map((video: PexelsVideo) => {
      // Find HD video file (prefer 1920x1080)
      const hdVideo = video.video_files.find(
        (file) => file.quality === 'hd' && file.width === 1920
      ) || video.video_files.find(
        (file) => file.quality === 'hd'
      ) || video.video_files[0];

      return {
        id: `pexels-${video.id}`,
        url: hdVideo.link,
        thumbnail_url: video.image,
        width: video.width,
        height: video.height,
        duration_sec: video.duration,
        user: {
          name: video.user.name,
          url: video.user.url,
        },
        source: 'pexels' as const,
      };
    });

    console.log(`Found ${videos.length} Pexels videos`);
    return videos;
  } catch (error) {
    console.error('Pexels search error:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, perPage = 15, page = 1 } = await req.json();
    
    if (!query) {
      throw new Error('Search query is required');
    }

    console.log('Stock video search request:', { query, perPage, page });

    // Search both providers in parallel
    const [pixabayVideos, pexelsVideos] = await Promise.all([
      searchPixabay(query, perPage),
      searchPexels(query, Math.ceil(perPage / 2)), // Fewer from Pexels to avoid rate limits
    ]);

    // Combine results, prioritizing Pixabay
    const allVideos = [...pixabayVideos, ...pexelsVideos];
    
    // Limit to requested perPage
    const videos = allVideos.slice(0, perPage);

    console.log(`Returning ${videos.length} total videos (${pixabayVideos.length} Pixabay, ${pexelsVideos.length} Pexels)`);

    return new Response(
      JSON.stringify({ 
        videos, 
        total: allVideos.length,
        sources: {
          pixabay: pixabayVideos.length,
          pexels: pexelsVideos.length,
        }
      }),
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
