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
    // No authentication required - this function can be called internally
    // by other edge functions like auto-generate-explainer
    const { query = '', mood = '', genre = '' } = await req.json();

    console.log('[search-stock-music] Search params:', { query, mood, genre });

    // Get Jamendo API key
    const jamendoClientId = Deno.env.get('JAMENDO_CLIENT_ID');
    if (!jamendoClientId) {
      throw new Error('JAMENDO_CLIENT_ID not configured');
    }

    // Map German terms to English Jamendo tags
    const moodMap: Record<string, string[]> = {
      'energetisch': ['energetic', 'upbeat'],
      'entspannt': ['relax', 'calm', 'chill'],
      'fröhlich': ['happy', 'upbeat'],
      'traurig': ['sad', 'emotional'],
      'dramatisch': ['dramatic', 'epic'],
      'romantisch': ['romantic', 'love'],
    };

    const genreMap: Record<string, string[]> = {
      'strandmusik': ['beach', 'summer', 'relax'],
      'pop': ['pop'],
      'rock': ['rock'],
      'elektronisch': ['electronic', 'dance'],
      'klassisch': ['classical'],
      'jazz': ['jazz'],
      'hip hop': ['hiphop', 'rap'],
      'ambient': ['ambient', 'atmospheric'],
    };

    // Build search tags from mood and genre with mapping
    const tags: string[] = [];
    
    if (mood && mood !== 'all') {
      const moodLower = mood.toLowerCase();
      const mappedMood = moodMap[moodLower] || [moodLower];
      tags.push(...mappedMood);
    }
    
    if (genre && genre !== 'all') {
      const genreLower = genre.toLowerCase();
      const mappedGenre = genreMap[genreLower] || [genreLower];
      tags.push(...mappedGenre);
    }

    // Fallback search strategy
    let jamendoData: JamendoResponse | null = null;
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts && (!jamendoData || jamendoData.results.length === 0)) {
      attempt++;
      let jamendoUrl = '';
      let searchStrategy = '';

      if (attempt === 1 && query) {
        // Try with search query and tags
        const tagsParam = tags.length > 0 ? `&tags=${tags.join('+')}` : '';
        jamendoUrl = `https://api.jamendo.com/v3.0/tracks/?client_id=${jamendoClientId}&format=json&limit=20&search=${encodeURIComponent(query)}${tagsParam}&include=musicinfo&audioformat=mp32`;
        searchStrategy = 'search query + tags';
      } else if (attempt === 2 && tags.length > 0) {
        // Try with tags only
        jamendoUrl = `https://api.jamendo.com/v3.0/tracks/?client_id=${jamendoClientId}&format=json&limit=20&tags=${tags.join('+')}&include=musicinfo&audioformat=mp32`;
        searchStrategy = 'tags only';
      } else {
        // Generic fallback
        jamendoUrl = `https://api.jamendo.com/v3.0/tracks/?client_id=${jamendoClientId}&format=json&limit=20&tags=instrumental&include=musicinfo&audioformat=mp32`;
        searchStrategy = 'generic instrumental';
      }

      console.log(`[search-stock-music] Attempt ${attempt}/${maxAttempts} (${searchStrategy}):`, jamendoUrl.replace(jamendoClientId, 'XXX'));

      const jamendoResponse = await fetch(jamendoUrl);
      
      if (!jamendoResponse.ok) {
        console.error('[search-stock-music] API error:', jamendoResponse.status, jamendoResponse.statusText);
        const errorBody = await jamendoResponse.text();
        console.error('[search-stock-music] Error body:', errorBody);
        throw new Error(`Jamendo API error: ${jamendoResponse.status} ${jamendoResponse.statusText}`);
      }

      jamendoData = await jamendoResponse.json();

      // Validate response
      if (!jamendoData || !jamendoData.results) {
        console.error('[search-stock-music] Invalid API response format');
        continue;
      }

      // Log full response for debugging
      console.log('[search-stock-music] Full API response:', JSON.stringify({
        headers: jamendoData.headers,
        resultsCount: jamendoData.results.length,
        firstTrack: jamendoData.results[0] || null
      }));

      console.log(`[search-stock-music] Attempt ${attempt} returned ${jamendoData.results.length} tracks`);
      
      // If we got results, break the loop
      if (jamendoData.results.length > 0) {
        break;
      }
    }

    // Check if we got any results
    if (!jamendoData || jamendoData.results.length === 0) {
      console.log('[search-stock-music] No tracks found after all attempts');
      return new Response(
        JSON.stringify({ 
          success: true, 
          results: [],
          total: 0,
          source: 'jamendo',
          message: 'No tracks found. Try different search terms like: beach, rock, jazz, happy, relax'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

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

