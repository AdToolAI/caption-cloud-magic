import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY is not configured');
    }
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Searching articles for trend:', trend_name);

    // 1) Perplexity sonar for real web articles
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

        // If Perplexity returned citations but articles have no real URLs, enrich from citations
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
        // Fallback: use citations directly if available
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

    // 2) Lovable AI for YouTube video suggestions
    const videoPrompt = `Finde 3 relevante YouTube-Videos zum Trend "${trend_name}" (${platform || 'Social Media'}). 
Gib mir für jedes Video:
- title: Videotitel
- channel: Kanalname
- video_id: die YouTube Video-ID (11 Zeichen, z.B. "dQw4w9WgXcQ")

Antworte NUR mit einem JSON-Array:
[{"title":"...","channel":"...","video_id":"..."}]`;

    let videos: Array<{ title: string; channel: string; video_id: string }> = [];

    try {
      const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'Du bist ein YouTube-Recherche-Experte. Antworte nur mit validem JSON.' },
            { role: 'user', content: videoPrompt }
          ],
          temperature: 0.7,
          max_tokens: 800,
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const videoContent = aiData.choices?.[0]?.message?.content || '[]';
        let cleaned = videoContent.trim();
        if (cleaned.startsWith('```json')) {
          cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }
        videos = JSON.parse(cleaned);
      }
    } catch (videoError) {
      console.error('Error fetching videos:', videoError);
    }

    console.log('Found articles:', articles.length, 'videos:', videos.length);

    return new Response(
      JSON.stringify({ articles, videos }),
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
