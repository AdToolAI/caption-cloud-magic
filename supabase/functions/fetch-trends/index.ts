import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Curated fallback trending data
const FALLBACK_TRENDS = [
  {
    platform: "instagram",
    trend_type: "hashtag",
    name: "#MondayMotivation",
    description: "Creators share positive mindset routines and motivational content",
    popularity_index: 86,
    language: "en",
    category: "Lifestyle",
    region: "Global",
    data_json: { sample_posts: [] }
  },
  {
    platform: "tiktok",
    trend_type: "sound",
    name: "Trending Audio - Productivity",
    description: "Popular sound for productivity and morning routine videos",
    popularity_index: 92,
    language: "en",
    category: "Productivity",
    region: "Global",
    data_json: { sample_posts: [] }
  },
  {
    platform: "linkedin",
    trend_type: "topic",
    name: "#AIinBusiness",
    description: "Discussions about AI implementation in business workflows",
    popularity_index: 78,
    language: "en",
    category: "Business",
    region: "Global",
    data_json: { sample_posts: [] }
  },
  {
    platform: "instagram",
    trend_type: "hashtag",
    name: "#FitnessTransformation",
    description: "Before and after fitness journey content",
    popularity_index: 84,
    language: "en",
    category: "Fitness",
    region: "Global",
    data_json: { sample_posts: [] }
  },
  {
    platform: "tiktok",
    trend_type: "hashtag",
    name: "#FoodTok",
    description: "Easy recipes and cooking hacks",
    popularity_index: 95,
    language: "en",
    category: "Food",
    region: "Global",
    data_json: { sample_posts: [] }
  },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { language = 'en', platform, category } = await req.json();

    console.log('Fetching trends:', { language, platform, category });

    // Check if we have recent trends (last 24 hours)
    const { data: existingTrends, error: fetchError } = await supabase
      .from('trend_entries')
      .select('*')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('popularity_index', { ascending: false });

    if (fetchError) {
      console.error('Error fetching trends:', fetchError);
    }

    // If we have recent trends, return them
    if (existingTrends && existingTrends.length > 0) {
      let filteredTrends = existingTrends;
      
      if (platform) {
        filteredTrends = filteredTrends.filter(t => t.platform === platform);
      }
      if (category) {
        filteredTrends = filteredTrends.filter(t => t.category === category);
      }
      if (language !== 'en') {
        filteredTrends = filteredTrends.filter(t => t.language === language);
      }

      console.log('Returning existing trends:', filteredTrends.length);
      return new Response(JSON.stringify({ trends: filteredTrends }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Otherwise, insert fallback trends
    console.log('No recent trends found, inserting fallback data');
    const { data: insertedTrends, error: insertError } = await supabase
      .from('trend_entries')
      .insert(FALLBACK_TRENDS)
      .select();

    if (insertError) {
      console.error('Error inserting trends:', insertError);
      throw insertError;
    }

    return new Response(JSON.stringify({ trends: insertedTrends || FALLBACK_TRENDS }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in fetch-trends:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
