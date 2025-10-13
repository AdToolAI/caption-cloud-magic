import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Curated fallback trending data with rich content ideas
const FALLBACK_TRENDS = [
  {
    platform: "tiktok",
    trend_type: "product",
    name: "Magnetic Cable Organizer",
    description: "Viral tech gadget showing chaotic vs. clean desk setups. Perfect for productivity content.",
    popularity_index: 91,
    language: "en",
    category: "E-Commerce",
    region: "Global",
    data_json: {
      content_ideas: [
        { title: "Before/After Desk Setup", description: "Show messy vs. clean workspace transformation", hook: "POV: Your desk after discovering this gadget" },
        { title: "Problem-Solution Reel", description: "Highlight cable chaos and instant fix", hook: "This changed my WFH setup forever" },
        { title: "Unboxing & Quick Demo", description: "Short video with magnetic sound effect", hook: "Wait for the satisfying click..." }
      ],
      hashtags: ["#TechTok", "#ProductivityHacks", "#EcomFinds", "#DeskSetup", "#WFH"],
      audience_fit: "Tech-savvy millennials and online shoppers",
      estimated_virality: "High",
      examples: [
        { url: "https://tiktok.com/@techstore/video/1234", likes: 152000 },
        { url: "https://instagram.com/reel/xyz", likes: 84000 }
      ]
    }
  },
  {
    platform: "instagram",
    trend_type: "hashtag",
    name: "#MondayMotivation",
    description: "Creators share positive mindset routines and motivational content with authentic storytelling",
    popularity_index: 86,
    language: "en",
    category: "Social Media Growth",
    region: "Global",
    data_json: {
      content_ideas: [
        { title: "Weekly Goal Setting Reel", description: "Share 3 goals for the week with upbeat music", hook: "This Monday hits different when you..." },
        { title: "Morning Routine Transformation", description: "Show your productive morning in 30 seconds", hook: "How I went from snoozing to winning" },
        { title: "Motivational Quote + Personal Story", description: "Pair trending quote with your journey", hook: "This quote changed my mindset in 2025" }
      ],
      hashtags: ["#MondayMotivation", "#Mindset", "#ProductivityTips", "#SuccessStory", "#GoalGetter"],
      audience_fit: "Entrepreneurs, content creators, self-improvement community",
      estimated_virality: "Medium-High",
      examples: []
    }
  },
  {
    platform: "linkedin",
    trend_type: "topic",
    name: "#AIinBusiness",
    description: "Discussions about AI implementation in business workflows and productivity automation",
    popularity_index: 88,
    language: "en",
    category: "Business & AI",
    region: "Global",
    data_json: {
      content_ideas: [
        { title: "AI Tool Stack Reveal", description: "Share your top 5 AI tools with ROI results", hook: "These AI tools 10x'd my output in 2025" },
        { title: "Before/After AI Implementation", description: "Show time saved with specific metrics", hook: "We automated 40 hours/week with AI" },
        { title: "AI Myth Busting Post", description: "Address common misconceptions professionally", hook: "3 AI myths that are costing you time" }
      ],
      hashtags: ["#AIinBusiness", "#ProductivityAutomation", "#FutureOfWork", "#BusinessInnovation", "#AITools"],
      audience_fit: "Business owners, entrepreneurs, tech professionals",
      estimated_virality: "High",
      examples: []
    }
  },
  {
    platform: "instagram",
    trend_type: "hashtag",
    name: "#FitnessTransformation",
    description: "Before and after fitness journey content with authentic progress documentation",
    popularity_index: 84,
    language: "en",
    category: "Lifestyle & Health",
    region: "Global",
    data_json: {
      content_ideas: [
        { title: "90-Day Progress Reel", description: "Show journey with motivational overlay", hook: "What 90 days of consistency looks like" },
        { title: "Workout Routine Breakdown", description: "Share exact exercises with form tips", hook: "The workout that changed everything" },
        { title: "Mindset Shift Story", description: "Focus on mental transformation", hook: "Fitness isn't just physical..." }
      ],
      hashtags: ["#FitnessTransformation", "#FitnessJourney", "#HealthyLifestyle", "#WorkoutMotivation", "#ProgressNotPerfection"],
      audience_fit: "Fitness enthusiasts, health-conscious individuals",
      estimated_virality: "Medium-High",
      examples: []
    }
  },
  {
    platform: "tiktok",
    trend_type: "hashtag",
    name: "#FoodTok",
    description: "Easy recipes and cooking hacks with trending sounds and quick tutorials",
    popularity_index: 95,
    language: "en",
    category: "Entertainment",
    region: "Global",
    data_json: {
      content_ideas: [
        { title: "60-Second Recipe Tutorial", description: "Quick meal prep with trending audio", hook: "You've been making this wrong..." },
        { title: "Kitchen Hack Reveal", description: "Show surprising cooking shortcut", hook: "This changed how I cook forever" },
        { title: "Food Aesthetic + ASMR", description: "Satisfying cooking sounds and visuals", hook: "POV: Cooking for the algorithm" }
      ],
      hashtags: ["#FoodTok", "#EasyRecipes", "#CookingHacks", "#FoodASMR", "#RecipeIdeas"],
      audience_fit: "Food lovers, home cooks, recipe seekers",
      estimated_virality: "Very High",
      examples: []
    }
  },
  {
    platform: "youtube",
    trend_type: "topic",
    name: "Side Hustle Ideas 2025",
    description: "Monetization strategies and passive income tutorials for creators and entrepreneurs",
    popularity_index: 89,
    language: "en",
    category: "Finance & Side Hustles",
    region: "Global",
    data_json: {
      content_ideas: [
        { title: "My $5K/Month Side Hustle Breakdown", description: "Detailed revenue and time investment analysis", hook: "How I make $5K/month working 10 hours/week" },
        { title: "5 Low-Investment Side Hustles", description: "List format with pros/cons for each", hook: "Start these with less than $100" },
        { title: "Passive Income Reality Check", description: "Honest discussion of effort required", hook: "The truth about passive income nobody tells you" }
      ],
      hashtags: ["#SideHustle", "#PassiveIncome", "#MakeMoneyOnline", "#FinancialFreedom", "#EntrepreneurLife"],
      audience_fit: "Aspiring entrepreneurs, students, career professionals",
      estimated_virality: "High",
      examples: []
    }
  },
  {
    platform: "pinterest",
    trend_type: "topic",
    name: "Minimalist Home Decor",
    description: "Clean aesthetic home design ideas with neutral color palettes and functional spaces",
    popularity_index: 82,
    language: "en",
    category: "Beauty, Fashion & Home",
    region: "Global",
    data_json: {
      content_ideas: [
        { title: "Room Transformation Pin", description: "Before/after with product links", hook: "Minimalist bedroom under $500" },
        { title: "Budget Decor Hacks", description: "DIY ideas for minimalist aesthetic", hook: "Achieve this look without spending $$$" },
        { title: "Color Palette Guide", description: "Neutral tones with styling tips", hook: "The perfect minimalist color palette" }
      ],
      hashtags: ["#MinimalistHome", "#HomeDecor", "#InteriorDesign", "#NeutralAesthetic", "#HomeInspo"],
      audience_fit: "Homeowners, interior design enthusiasts, minimalists",
      estimated_virality: "Medium",
      examples: []
    }
  },
  {
    platform: "instagram",
    trend_type: "sound",
    name: "Productivity Morning Sound",
    description: "Upbeat motivational audio trending in morning routine and productivity content",
    popularity_index: 87,
    language: "en",
    category: "Motivation & Education",
    region: "Global",
    data_json: {
      content_ideas: [
        { title: "5 AM Club Routine", description: "Show your early morning habits synced to beat drops", hook: "How I became a morning person" },
        { title: "Desk Setup Time-lapse", description: "Quick workspace preparation video", hook: "Setting up for a productive day" },
        { title: "Goal Board Creation", description: "Creating vision board with energetic pacing", hook: "Manifesting 2025 goals like..." }
      ],
      hashtags: ["#MorningRoutine", "#ProductivityTips", "#5AMClub", "#SuccessMindset", "#DailyHabits"],
      audience_fit: "Productivity enthusiasts, entrepreneurs, students",
      estimated_virality: "Medium-High",
      examples: []
    }
  }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Input validation
    const requestSchema = z.object({
      language: z.string().regex(/^[a-z]{2}$/).optional().default('en'),
      platform: z.string().max(50).optional(),
      category: z.string().max(100).optional(),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { language, platform, category } = validation.data;

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
    return new Response(JSON.stringify({ error: 'Failed to fetch trends' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
