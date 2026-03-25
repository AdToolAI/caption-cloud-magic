import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { trend_name, trend_description, platform, category } = await req.json();

    if (!trend_name) {
      return new Response(
        JSON.stringify({ error: 'trend_name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    if (!PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY is not configured');
    }

    console.log('Searching articles for trend:', trend_name);

    // Perplexity sonar for real web articles
    const perplexityPrompt = `Find 4-5 recent and relevant articles about this social media trend: "${trend_name}". ${trend_description ? `Context: ${trend_description}.` : ''} ${platform ? `Platform: ${platform}.` : ''} ${category ? `Category: ${category}.` : ''} Focus on marketing blogs, social media news sites, and industry publications.`;

    const perplexityRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: 'You are a trend research expert. Return your findings as a JSON array of articles. Each article must have: title (string), url (string, the real URL), description (string, 1-2 sentences). Return ONLY the JSON array, no other text.' },
          { role: 'user', content: perplexityPrompt }
        ],
        temperature: 0.3,
      }),
    });

    let articles: Array<{ title: string; url: string; description: string; source: string }> = [];

    if (perplexityRes.ok) {
      const perplexityData = await perplexityRes.json();
      const content = perplexityData.choices?.[0]?.message?.content || '[]';
      const citations = perplexityData.citations || [];

      try {
        let cleanedContent = content.trim();
        if (cleanedContent.startsWith('```json')) {
          cleanedContent = cleanedContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (cleanedContent.startsWith('```')) {
          cleanedContent = cleanedContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }
        const parsed = JSON.parse(cleanedContent);
        
        articles = (Array.isArray(parsed) ? parsed : []).map((a: any) => {
          const url = a.url || '';
          let source = '';
          try {
            source = new URL(url).hostname.replace('www.', '');
          } catch {
            source = url;
          }
          return {
            title: a.title || 'Untitled',
            url,
            description: a.description || '',
            source,
          };
        });

        // If articles have no real URLs, enrich from citations
        if (citations.length > 0 && articles.every((a: any) => !a.url || a.url === '')) {
          articles = articles.map((a: any, i: number) => ({
            ...a,
            url: citations[i] || a.url,
            source: (() => {
              try { return new URL(citations[i] || '').hostname.replace('www.', ''); } catch { return a.source; }
            })(),
          }));
        }
      } catch (parseError) {
        console.error('Failed to parse Perplexity response:', content);
        if (citations.length > 0) {
          articles = citations.slice(0, 5).map((url: string, i: number) => {
            let source = '';
            try { source = new URL(url).hostname.replace('www.', ''); } catch { source = ''; }
            return {
              title: `${trend_name} – Quelle ${i + 1}`,
              url,
              description: `Relevanter Artikel zu "${trend_name}" von ${source}`,
              source,
            };
          });
        }
      }
    } else {
      console.error('Perplexity API error:', perplexityRes.status, await perplexityRes.text());
    }

    // Generate YouTube search links (no fake video IDs)
    const searchQuery = encodeURIComponent(`${trend_name} ${platform || 'social media'} trend`);
    const videoSuggestions = [
      {
        title: `${trend_name} – Trend Analyse`,
        search_url: `https://www.youtube.com/results?search_query=${searchQuery}`,
        thumbnail: `https://img.youtube.com/vi/0/default.jpg`,
        query: `${trend_name} ${platform || 'social media'} trend`,
      },
      {
        title: `${trend_name} – Strategie & Tipps`,
        search_url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${trend_name} strategy tips ${category || ''}`)}`,
        thumbnail: null,
        query: `${trend_name} strategy tips ${category || ''}`,
      },
      {
        title: `${trend_name} – Best Practices ${new Date().getFullYear()}`,
        search_url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${trend_name} best practices ${new Date().getFullYear()}`)}`,
        thumbnail: null,
        query: `${trend_name} best practices ${new Date().getFullYear()}`,
      },
    ];

    console.log('Found articles:', articles.length, 'video suggestions:', videoSuggestions.length);

    return new Response(
      JSON.stringify({ articles, videos: videoSuggestions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in search-trend-articles:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return new Response(
        JSON.stringify({ error: 'Rate limit erreicht, bitte versuche es später erneut.', articles: [], videos: [] }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: errorMessage, articles: [], videos: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
