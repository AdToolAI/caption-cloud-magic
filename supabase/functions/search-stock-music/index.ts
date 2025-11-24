import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PixabayMusicResponse {
  total: number;
  totalHits: number;
  hits: Array<{
    id: number;
    pageURL: string;
    type: string;
    tags: string;
    duration: number;
    picture_small: string;
    picture_medium: string;
    picture_large: string;
    download_link: string;
    user_id: number;
    user: string;
  }>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { query = '', mood = '', genre = '' } = await req.json();

    console.log('[search-stock-music] Search params:', { query, mood, genre });

    // Get Pixabay API key
    const pixabayApiKey = Deno.env.get('PIXABAY_API_KEY');
    if (!pixabayApiKey) {
      throw new Error('PIXABAY_API_KEY not configured');
    }

    // Build search query
    const searchQuery = query || mood || genre || 'music';
    const pixabayUrl = `https://pixabay.com/api/?key=${pixabayApiKey}&q=${encodeURIComponent(searchQuery)}&audio_type=music&per_page=20`;

    console.log('[search-stock-music] Calling Pixabay API:', pixabayUrl.replace(pixabayApiKey, 'XXX'));

    // Call Pixabay API
    const pixabayResponse = await fetch(pixabayUrl);
    
    if (!pixabayResponse.ok) {
      throw new Error(`Pixabay API error: ${pixabayResponse.status} ${pixabayResponse.statusText}`);
    }

    const pixabayData: PixabayMusicResponse = await pixabayResponse.json();

    // Transform Pixabay results to our format
    let results = pixabayData.hits.map((hit) => ({
      id: hit.id,
      title: hit.tags.split(',')[0].trim() || 'Untitled',
      artist: hit.user,
      duration: hit.duration,
      url: hit.download_link,
      preview_url: hit.download_link,
      thumbnail: hit.picture_medium || hit.picture_small,
      genre: determineGenre(hit.tags),
      mood: determineMood(hit.tags),
      bpm: 120, // Pixabay doesn't provide BPM
      tags: hit.tags.split(',').map(t => t.trim()),
    }));

    // Apply filters
    if (mood && mood !== 'all') {
      results = results.filter(track => 
        track.mood.toLowerCase() === mood.toLowerCase() ||
        track.tags.some(tag => tag.toLowerCase().includes(mood.toLowerCase()))
      );
    }

    if (genre && genre !== 'all') {
      results = results.filter(track => 
        track.genre.toLowerCase() === genre.toLowerCase() ||
        track.tags.some(tag => tag.toLowerCase().includes(genre.toLowerCase()))
      );
    }

    console.log('[search-stock-music] Returning', results.length, 'results from Pixabay');

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        total: results.length,
        source: 'pixabay'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[search-stock-music] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

// Helper functions to determine genre and mood from tags
function determineGenre(tags: string): string {
  const tagLower = tags.toLowerCase();
  if (tagLower.includes('rock')) return 'rock';
  if (tagLower.includes('jazz')) return 'jazz';
  if (tagLower.includes('classical')) return 'classical';
  if (tagLower.includes('electronic') || tagLower.includes('techno')) return 'electronic';
  if (tagLower.includes('hip hop') || tagLower.includes('rap')) return 'hip-hop';
  if (tagLower.includes('acoustic') || tagLower.includes('folk')) return 'acoustic';
  if (tagLower.includes('ambient')) return 'ambient';
  if (tagLower.includes('cinematic') || tagLower.includes('orchestral')) return 'cinematic';
  return 'other';
}

function determineMood(tags: string): string {
  const tagLower = tags.toLowerCase();
  if (tagLower.includes('happy') || tagLower.includes('upbeat') || tagLower.includes('cheerful')) return 'upbeat';
  if (tagLower.includes('chill') || tagLower.includes('relaxing') || tagLower.includes('calm')) return 'chill';
  if (tagLower.includes('epic') || tagLower.includes('powerful') || tagLower.includes('dramatic')) return 'epic';
  if (tagLower.includes('sad') || tagLower.includes('melancholic')) return 'sad';
  if (tagLower.includes('energetic') || tagLower.includes('exciting')) return 'energetic';
  return 'neutral';
}
