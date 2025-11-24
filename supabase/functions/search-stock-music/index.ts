import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface JamendoTrack {
  id: string;
  name: string;
  artist_name: string;
  duration: number;
  audio: string;
  audiodownload: string;
  image: string;
  album_image: string;
}

interface JamendoResponse {
  headers: {
    status: string;
    results_count: number;
  };
  results: JamendoTrack[];
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

    // Get Jamendo API key
    const jamendoClientId = Deno.env.get('JAMENDO_CLIENT_ID');
    if (!jamendoClientId) {
      throw new Error('JAMENDO_CLIENT_ID not configured');
    }

    // Build search tags from mood and genre
    const tags: string[] = [];
    if (mood && mood !== 'all') tags.push(mood.toLowerCase());
    if (genre && genre !== 'all') tags.push(genre.toLowerCase());
    
    // Build search query
    const searchQuery = query || tags.join(' ') || 'instrumental';
    const tagsParam = tags.length > 0 ? `&tags=${tags.join('+')}` : '';
    
    const jamendoUrl = `https://api.jamendo.com/v3.0/tracks/?client_id=${jamendoClientId}&format=json&limit=20&search=${encodeURIComponent(searchQuery)}${tagsParam}&include=musicinfo&audioformat=mp32`;

    console.log('[search-stock-music] Calling Jamendo API:', jamendoUrl.replace(jamendoClientId, 'XXX'));

    // Call Jamendo API
    const jamendoResponse = await fetch(jamendoUrl);
    
    if (!jamendoResponse.ok) {
      throw new Error(`Jamendo API error: ${jamendoResponse.status} ${jamendoResponse.statusText}`);
    }

    const jamendoData: JamendoResponse = await jamendoResponse.json();

    console.log('[search-stock-music] Jamendo returned', jamendoData.results.length, 'tracks');

    // Transform Jamendo results to our format
    const results = jamendoData.results.map((track) => ({
      id: track.id,
      title: track.name,
      artist: track.artist_name,
      duration: track.duration,
      url: track.audiodownload || track.audio,
      preview_url: track.audio,
      thumbnail: track.album_image || track.image,
      genre: genre && genre !== 'all' ? genre : 'various',
      mood: mood && mood !== 'all' ? mood : 'neutral',
      bpm: 120,
      tags: tags.length > 0 ? tags : ['royalty-free', 'jamendo'],
    }));

    console.log('[search-stock-music] Returning', results.length, 'results from Jamendo');

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        total: results.length,
        source: 'jamendo'
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

