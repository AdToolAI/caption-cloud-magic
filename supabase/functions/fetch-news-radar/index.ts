import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CACHE_TTL_HOURS = 6;

const FALLBACK_NEWS = [
  { headline: "📱 Instagram expands Reels to 3 minutes for all creators", category: "social", source: "Instagram" },
  { headline: "💰 TikTok Shop expanding to new European markets", category: "business", source: "TikTok" },
  { headline: "📊 LinkedIn algorithm now prioritizes comments over reactions", category: "analytics", source: "LinkedIn" },
  { headline: "🎨 AI-powered video editing tools see 300% adoption increase", category: "creator", source: "Industry Report" },
  { headline: "📱 YouTube Shorts monetization program reaches 2M+ creators", category: "social", source: "YouTube" },
  { headline: "💰 Creator economy projected to reach $500B by 2027", category: "business", source: "Goldman Sachs" },
  { headline: "📊 Short-form video drives 2.5x more engagement than static posts", category: "analytics", source: "HubSpot" },
  { headline: "🎨 Meta launches new AI creative tools for advertisers", category: "creator", source: "Meta" },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { language = 'en' } = await req.json().catch(() => ({}));

    // Check cache first
    const cacheThreshold = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from('news_radar_cache')
      .select('news_json, fetched_at')
      .eq('language', language)
      .gte('fetched_at', cacheThreshold)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single();

    if (cached) {
      console.log('News Radar: serving from cache', cached.fetched_at);
      return new Response(
        JSON.stringify({ news: cached.news_json, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch fresh news via Perplexity
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    if (!PERPLEXITY_API_KEY) {
      console.warn('PERPLEXITY_API_KEY not set, returning fallback');
      return new Response(
        JSON.stringify({ news: FALLBACK_NEWS, cached: false, fallback: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const langInstruction = language === 'de'
      ? 'Antworte auf Deutsch.'
      : language === 'es'
        ? 'Responde en español.'
        : 'Respond in English.';

    const perplexityRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: `You are a social media industry news analyst. Return ONLY a JSON array of 8-10 news items. Each item: { "headline": "string (emoji prefix + concise headline, max 80 chars)", "category": "social|business|creator|analytics", "source": "string (publication name)" }. ${langInstruction} Use these emoji prefixes: 📱 for Social, 💰 for Business, 🎨 for Creator, 📊 for Analytics. Focus on actionable, important news that social media managers and content creators need to know.`
          },
          {
            role: 'user',
            content: `What are the 8-10 most important social media, creator economy, and digital marketing news from the last 7 days? Include platform updates, algorithm changes, new features, monetization news, and industry trends. Only include verified, real news — no speculation.`
          }
        ],
        temperature: 0.2,
        search_recency_filter: 'week',
      }),
    });

    let news = FALLBACK_NEWS;

    if (perplexityRes.ok) {
      const data = await perplexityRes.json();
      const content = data.choices?.[0]?.message?.content || '[]';

      try {
        let cleaned = content.trim();
        if (cleaned.startsWith('```json')) {
          cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed) && parsed.length > 0) {
          news = parsed.map((item: any) => ({
            headline: String(item.headline || '').slice(0, 120),
            category: ['social', 'business', 'creator', 'analytics'].includes(item.category) ? item.category : 'social',
            source: String(item.source || 'Unknown').slice(0, 50),
          }));
        }
      } catch (parseErr) {
        console.error('Failed to parse Perplexity news response:', parseErr);
      }
    } else {
      console.error('Perplexity API error:', perplexityRes.status);
    }

    // Store in cache
    await supabase
      .from('news_radar_cache')
      .insert({ news_json: news, language, fetched_at: new Date().toISOString() });

    // Clean old cache entries (keep last 10)
    const { data: oldEntries } = await supabase
      .from('news_radar_cache')
      .select('id')
      .eq('language', language)
      .order('fetched_at', { ascending: false })
      .range(10, 100);

    if (oldEntries && oldEntries.length > 0) {
      await supabase
        .from('news_radar_cache')
        .delete()
        .in('id', oldEntries.map(e => e.id));
    }

    console.log('News Radar: fetched', news.length, 'fresh news items');

    return new Response(
      JSON.stringify({ news, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-news-radar:', error);
    return new Response(
      JSON.stringify({ news: FALLBACK_NEWS, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
