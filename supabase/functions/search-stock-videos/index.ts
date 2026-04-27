import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  video_pictures: Array<{ id: number; picture: string }>;
  user: { name: string; url: string };
}

interface TransformedVideo {
  id: string | number;
  url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  duration_sec: number;
  user: { name: string; url: string };
  source: 'pixabay' | 'pexels';
}

async function searchPixabay(query: string, perPage: number): Promise<TransformedVideo[]> {
  try {
    const key = Deno.env.get('PIXABAY_API_KEY');
    if (!key) return [];
    const url = `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&per_page=${perPage}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Pixabay API error:', response.status);
      return [];
    }
    const data = await response.json();
    if (!data.hits?.length) return [];
    return data.hits.map((video: PixabayVideo) => {
      const f = video.videos.large || video.videos.medium || video.videos.small || video.videos.tiny;
      return {
        id: `pixabay-${video.id}`,
        url: f?.url || '',
        thumbnail_url: f?.thumbnail || `https://i.vimeocdn.com/video/${video.picture_id}_640x360.jpg`,
        width: f?.width || 1920,
        height: f?.height || 1080,
        duration_sec: video.duration,
        user: { name: video.user || 'Pixabay User', url: video.pageURL },
        source: 'pixabay' as const,
      };
    });
  } catch (e) {
    console.error('Pixabay search error:', e);
    return [];
  }
}

async function searchPexels(query: string, perPage: number): Promise<TransformedVideo[]> {
  try {
    const key = Deno.env.get('PEXELS_API_KEY');
    if (!key) return [];
    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=1`,
      { headers: { 'Authorization': key } }
    );
    if (!response.ok) {
      console.error('Pexels API error:', response.status);
      return [];
    }
    const data = await response.json();
    if (!data.videos?.length) return [];
    return data.videos.map((video: PexelsVideo) => {
      const hd = video.video_files.find(f => f.quality === 'hd' && f.width === 1920)
        || video.video_files.find(f => f.quality === 'hd')
        || video.video_files[0];
      return {
        id: `pexels-${video.id}`,
        url: hd.link,
        thumbnail_url: video.image,
        width: video.width,
        height: video.height,
        duration_sec: video.duration,
        user: { name: video.user.name, url: video.user.url },
        source: 'pexels' as const,
      };
    });
  } catch (e) {
    console.error('Pexels search error:', e);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { query, perPage = 15, force_refresh = false } = await req.json();
    if (!query || typeof query !== 'string') throw new Error('Search query is required');

    const cacheKey = `video:${query.toLowerCase().trim()}:${perPage}`;
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
      : null;

    // Cache lookup
    if (supabase && !force_refresh) {
      const { data: cached } = await supabase
        .from('stock_search_cache')
        .select('id, results_json, provider_counts, hit_count, expires_at')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (cached?.results_json) {
        await supabase.from('stock_search_cache').update({ hit_count: (cached.hit_count ?? 0) + 1 }).eq('id', cached.id);
        console.log(`[stock-videos] cache HIT for "${query}" (${cached.hit_count + 1} hits)`);
        return new Response(
          JSON.stringify({
            videos: cached.results_json,
            total: (cached.results_json as unknown[]).length,
            sources: cached.provider_counts ?? {},
            cached: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`[stock-videos] cache MISS for "${query}", fetching live`);
    const [pixabay, pexels] = await Promise.all([
      searchPixabay(query, perPage),
      searchPexels(query, Math.ceil(perPage / 2)),
    ]);
    const all = [...pixabay, ...pexels].slice(0, perPage);
    const sources = { pixabay: pixabay.length, pexels: pexels.length };

    if (supabase && all.length > 0) {
      await supabase.from('stock_search_cache').upsert(
        {
          cache_key: cacheKey,
          query,
          media_type: 'video',
          results_json: all,
          provider_counts: sources,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'cache_key' }
      );
    }

    return new Response(
      JSON.stringify({ videos: all, total: all.length, sources, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error searching stock videos:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
