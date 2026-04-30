import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-qa-mock',
};

const CACHE_TTL_HOURS = 1;

const FALLBACK_NEWS = [
  { headline: "📱 Instagram testet neues Creator-Abo-Modell", category: "platform", source: "The Verge" },
  { headline: "💰 TikTok Shop expandiert in neue europäische Märkte", category: "monetization", source: "TechCrunch" },
  { headline: "📊 LinkedIn-Algorithmus priorisiert jetzt Kommentare statt Reaktionen", category: "analytics", source: "Social Media Today" },
  { headline: "🤖 Adobe Firefly bekommt neue KI-Video-Funktionen für Marketer", category: "ai_tools", source: "Adobe Blog" },
  { headline: "📱 YouTube Shorts Monetarisierung erreicht 2M+ Creator", category: "monetization", source: "YouTube" },
  { headline: "🤖 Canva launcht KI-gestützte Batch-Erstellung für Social Media", category: "ai_tools", source: "Canva" },
  { headline: "📊 Kurzvideos generieren 2,5x mehr Engagement als statische Posts", category: "analytics", source: "HubSpot" },
  { headline: "💬 Meta verbessert Community-Management-Tools für Facebook-Gruppen", category: "community", source: "Meta Newsroom" },
];

const CATEGORY_LABELS: Record<string, string> = {
  platform: "Platform Updates",
  ai_tools: "AI & Tools",
  analytics: "Analytics & Data",
  monetization: "Monetization",
  community: "Community & Growth",
};

function validateDiversity(news: any[]): boolean {
  if (!Array.isArray(news) || news.length < 6) return false;
  const sources = new Set(news.map(n => n.source?.toLowerCase()));
  const categories = new Set(news.map(n => n.category));
  const sourceCounts: Record<string, number> = {};
  for (const n of news) {
    const s = n.source?.toLowerCase() || '';
    sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  }
  const maxPerSource = Math.max(...Object.values(sourceCounts));
  return sources.size >= 4 && categories.size >= 3 && maxPerSource <= 3;
}

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

    // Gather recent headlines to avoid repetition
    let recentHeadlines: string[] = [];
    let overusedSources: string[] = [];
    const { data: recentCache } = await supabase
      .from('news_radar_cache')
      .select('news_json')
      .eq('language', language)
      .order('fetched_at', { ascending: false })
      .limit(5);
    if (recentCache) {
      const allItems = recentCache.flatMap((r: any) => r.news_json || []);
      recentHeadlines = allItems.map((n: any) => n.headline).slice(0, 30);
      // Find overused sources
      const sourceCounts: Record<string, number> = {};
      for (const item of allItems) {
        const s = (item.source || '').toLowerCase();
        sourceCounts[s] = (sourceCounts[s] || 0) + 1;
      }
      overusedSources = Object.entries(sourceCounts)
        .filter(([_, count]) => count >= 3)
        .map(([source]) => source);
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
      ? 'Schreibe alle Headlines auf Deutsch.'
      : language === 'es'
        ? 'Escribe todos los titulares en español.'
        : 'Write all headlines in English.';

    const avoidClause = recentHeadlines.length > 0
      ? `IMPORTANT: Do NOT repeat or rephrase any of these recent headlines:\n${recentHeadlines.slice(0, 15).map(h => `- "${h}"`).join('\n')}\nFind completely different topics.`
      : '';

    const overuseClause = overusedSources.length > 0
      ? `AVOID overusing these sources (use max 1 time): ${overusedSources.join(', ')}.`
      : '';

    const systemPrompt = `You are a social media industry news curator for social media managers, content creators, and digital marketers. Current time: ${new Date().toISOString()}.

Return ONLY a JSON array of exactly 10 news items. Each item must have:
- "headline": string (emoji prefix + concise headline, max 90 chars)
- "category": one of "platform" | "ai_tools" | "analytics" | "monetization" | "community"
- "source": string (the actual publication/website name, NOT a social platform name)

STRICT DIVERSITY RULES:
- Cover ALL 5 categories: platform updates, AI/tools, analytics/data, monetization, community/growth
- At least 2 items per category minimum
- Maximum 2 items from the same source
- Use diverse, real sources: TechCrunch, The Verge, Social Media Today, HubSpot, Later, Buffer, Hootsuite, Sprout Social, Marketing Brew, Adweek, Search Engine Journal, Content Marketing Institute, Creator Economy, Digiday, etc.
- Do NOT use a single tool/platform (like SocialBee, Hootsuite) as source for more than 2 items

Emoji prefixes by category:
📱 = platform, 🤖 = ai_tools, 📊 = analytics, 💰 = monetization, 💬 = community

${langInstruction}
${avoidClause}
${overuseClause}

Focus on ACTIONABLE, BREAKING news from the last 24 hours that directly impacts how social media managers work. Include platform algorithm changes, new creator tools, monetization updates, engagement insights, and community management trends.`;

    const fetchFromPerplexity = async (prompt: string): Promise<any[] | null> => {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            { role: 'system', content: prompt },
            {
              role: 'user',
              content: `What are the 10 most important and diverse social media, creator economy, AI marketing tools, and digital marketing news from the last 24 hours? Cover platform updates (Instagram, TikTok, LinkedIn, YouTube, X, Threads), new AI/automation tools, analytics insights, monetization changes, and community management trends. Only include verified, real news from reputable sources.`
            }
          ],
          temperature: 0.7,
          search_recency_filter: 'day',
        }),
      });

      if (!res.ok) {
        console.error('Perplexity API error:', res.status);
        return null;
      }

      const data = await res.json();
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
          return parsed.map((item: any) => ({
            headline: String(item.headline || '').slice(0, 120),
            category: ['platform', 'ai_tools', 'analytics', 'monetization', 'community'].includes(item.category) ? item.category : 'platform',
            source: String(item.source || 'Unknown').slice(0, 50),
          }));
        }
      } catch (parseErr) {
        console.error('Failed to parse Perplexity response:', parseErr);
      }
      return null;
    };

    // First attempt
    let news = await fetchFromPerplexity(systemPrompt);

    // If result is not diverse enough, retry once with stricter prompt
    if (news && !validateDiversity(news)) {
      console.log('News Radar: first result not diverse enough, retrying...');
      const retryPrompt = systemPrompt + `\n\nCRITICAL: Your previous response was too homogeneous. You MUST use at least 6 different sources and cover all 5 categories. Do NOT use the same source more than twice.`;
      const retry = await fetchFromPerplexity(retryPrompt);
      if (retry && validateDiversity(retry)) {
        news = retry;
      } else if (retry) {
        news = retry; // Use retry even if not perfect, it's likely better
      }
    }

    if (!news || news.length === 0) {
      news = FALLBACK_NEWS;
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

    console.log('News Radar: fetched', news.length, 'items, sources:', [...new Set(news.map((n: any) => n.source))].join(', '));

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
