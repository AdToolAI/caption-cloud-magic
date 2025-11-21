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

    // Use Pixabay Music API (free, no API key required for basic usage)
    // Note: For production, you should get a Pixabay API key
    const searchQuery = query || mood || genre || 'background';
    const pixabayUrl = `https://pixabay.com/api/music/?key=&q=${encodeURIComponent(searchQuery)}&per_page=20`;

    // For now, return mock data since Pixabay requires API key
    // In production, use actual API call above
    const mockResults = [
      {
        id: 1,
        title: 'Upbeat Corporate',
        artist: 'AudioJungle',
        duration: 180,
        url: 'https://example.com/music/upbeat-corporate.mp3',
        preview_url: 'https://example.com/music/upbeat-corporate-preview.mp3',
        thumbnail: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=300',
        genre: 'corporate',
        mood: 'upbeat',
        bpm: 120,
        tags: ['corporate', 'upbeat', 'motivational', 'business']
      },
      {
        id: 2,
        title: 'Chill Lo-Fi Beats',
        artist: 'Epidemic Sound',
        duration: 240,
        url: 'https://example.com/music/lofi-chill.mp3',
        preview_url: 'https://example.com/music/lofi-chill-preview.mp3',
        thumbnail: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300',
        genre: 'lofi',
        mood: 'chill',
        bpm: 85,
        tags: ['lofi', 'chill', 'relaxing', 'hip-hop']
      },
      {
        id: 3,
        title: 'Epic Cinematic',
        artist: 'Artlist',
        duration: 200,
        url: 'https://example.com/music/epic-cinematic.mp3',
        preview_url: 'https://example.com/music/epic-cinematic-preview.mp3',
        thumbnail: 'https://images.unsplash.com/photo-1�509809072537-f5f31cc9e3c6?w=300',
        genre: 'cinematic',
        mood: 'epic',
        bpm: 140,
        tags: ['cinematic', 'epic', 'dramatic', 'orchestral']
      },
      {
        id: 4,
        title: 'Happy Acoustic',
        artist: 'Free Music Archive',
        duration: 165,
        url: 'https://example.com/music/happy-acoustic.mp3',
        preview_url: 'https://example.com/music/happy-acoustic-preview.mp3',
        thumbnail: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=300',
        genre: 'acoustic',
        mood: 'happy',
        bpm: 110,
        tags: ['acoustic', 'happy', 'positive', 'folk']
      },
      {
        id: 5,
        title: 'Ambient Space',
        artist: 'Soundstripe',
        duration: 220,
        url: 'https://example.com/music/ambient-space.mp3',
        preview_url: 'https://example.com/music/ambient-space-preview.mp3',
        thumbnail: 'https://images.unsplash.com/photo-1518972559570-7cc1309f3229?w=300',
        genre: 'ambient',
        mood: 'calm',
        bpm: 60,
        tags: ['ambient', 'space', 'calm', 'atmospheric']
      }
    ];

    // Filter mock results based on search criteria
    let filteredResults = mockResults;
    
    if (query) {
      filteredResults = filteredResults.filter(track => 
        track.title.toLowerCase().includes(query.toLowerCase()) ||
        track.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
      );
    }

    if (mood) {
      filteredResults = filteredResults.filter(track => 
        track.mood.toLowerCase() === mood.toLowerCase()
      );
    }

    if (genre) {
      filteredResults = filteredResults.filter(track => 
        track.genre.toLowerCase() === genre.toLowerCase()
      );
    }

    console.log('[search-stock-music] Returning', filteredResults.length, 'results');

    return new Response(
      JSON.stringify({ 
        success: true, 
        results: filteredResults,
        total: filteredResults.length,
        note: 'Mock data - integrate real API for production'
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
