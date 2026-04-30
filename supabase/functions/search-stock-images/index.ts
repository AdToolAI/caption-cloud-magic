import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

interface PixabayImage {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
  fullHDURL?: string;
  imageURL?: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  userImageURL: string;
}

interface PexelsImage {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  src: {
    original: string;
    large: string;
    large2x: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
}

interface TransformedImage {
  id: string | number;
  url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  user: {
    name: string;
    url: string;
  };
  source: 'pixabay' | 'pexels';
}

async function searchPixabay(query: string, perPage: number = 20): Promise<TransformedImage[]> {
  try {
    const pixabayApiKey = Deno.env.get('PIXABAY_API_KEY');
    
    if (!pixabayApiKey) {
      console.log('No Pixabay API key configured, skipping Pixabay search');
      return [];
    }
    
    const url = `https://pixabay.com/api/?key=${pixabayApiKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=${perPage}`;
    
    console.log('Searching Pixabay for images:', query);
    
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
      console.log('No Pixabay image results found');
      return [];
    }
    
    const images = data.hits.map((image: PixabayImage) => {
      return {
        id: `pixabay-${image.id}`,
        url: image.largeImageURL || image.webformatURL,
        thumbnail_url: image.previewURL,
        width: image.imageWidth,
        height: image.imageHeight,
        user: {
          name: image.user || 'Pixabay User',
          url: image.pageURL,
        },
        source: 'pixabay' as const,
      };
    });
    
    console.log(`Found ${images.length} Pixabay images`);
    return images;
  } catch (error) {
    console.error('Pixabay image search error:', error);
    return [];
  }
}

async function searchPexels(query: string, perPage: number = 15): Promise<TransformedImage[]> {
  try {
    const pexelsApiKey = Deno.env.get('PEXELS_API_KEY');
    
    if (!pexelsApiKey) {
      console.log('No Pexels API key configured, skipping Pexels search');
      return [];
    }
    
    console.log('Searching Pexels for images:', query);
    
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=1`,
      {
        headers: {
          'Authorization': pexelsApiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pexels API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 200),
        query: query
      });
      return [];
    }

    const data = await response.json();
    
    if (!data.photos || data.photos.length === 0) {
      console.log('No Pexels image results found');
      return [];
    }
    
    const images = data.photos.map((photo: PexelsImage) => {
      return {
        id: `pexels-${photo.id}`,
        url: photo.src.large,
        thumbnail_url: photo.src.medium,
        width: photo.width,
        height: photo.height,
        user: {
          name: photo.photographer,
          url: photo.photographer_url,
        },
        source: 'pexels' as const,
      };
    });

    console.log(`Found ${images.length} Pexels images`);
    return images;
  } catch (error) {
    console.error('Pexels image search error:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, perPage = 30, force_refresh = false } = await req.json();
    if (!query || typeof query !== 'string') throw new Error('Search query is required');

    const cacheKey = `image:${query.toLowerCase().trim()}:${perPage}`;
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
      : null;

    if (supabase && !force_refresh) {
      const { data: cached } = await supabase
        .from('stock_search_cache')
        .select('id, results_json, provider_counts, hit_count, expires_at')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (cached?.results_json) {
        await supabase.from('stock_search_cache').update({ hit_count: (cached.hit_count ?? 0) + 1 }).eq('id', cached.id);
        console.log(`[stock-images] cache HIT for "${query}"`);
        return new Response(
          JSON.stringify({
            images: cached.results_json,
            total: (cached.results_json as unknown[]).length,
            sources: cached.provider_counts ?? {},
            cached: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`[stock-images] cache MISS for "${query}", fetching live`);
    const [pixabayImages, pexelsImages] = await Promise.all([
      searchPixabay(query, 20),
      searchPexels(query, 15),
    ]);
    const allImages = [...pixabayImages, ...pexelsImages].slice(0, perPage);
    const sources = { pixabay: pixabayImages.length, pexels: pexelsImages.length };

    if (supabase && allImages.length > 0) {
      await supabase.from('stock_search_cache').upsert(
        {
          cache_key: cacheKey,
          query,
          media_type: 'image',
          results_json: allImages,
          provider_counts: sources,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'cache_key' }
      );
    }

    return new Response(
      JSON.stringify({ images: allImages, total: allImages.length, sources, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error searching stock images:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});