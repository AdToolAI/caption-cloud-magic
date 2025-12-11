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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Searching articles for trend:', trend_name);

    // Use Lovable AI to generate relevant article suggestions with URLs
    const prompt = `Du bist ein Trend-Recherche-Experte. Generiere 3-4 relevante Artikel-Vorschläge für folgenden Social Media Trend:

Trend: ${trend_name}
Beschreibung: ${trend_description || 'Keine Beschreibung verfügbar'}
Plattform: ${platform || 'Allgemein'}
Kategorie: ${category || 'Allgemein'}

Gib mir für jeden Artikel:
1. Einen realistischen Titel
2. Eine kurze Beschreibung (1-2 Sätze)
3. Eine plausible URL (z.B. von bekannten Marketing-Blogs, Social Media Magazinen, oder News-Seiten wie socialmediatoday.com, hootsuite.com, sproutsocial.com, buffer.com, later.com, hubspot.com, marketingland.com)

Antworte NUR mit einem JSON-Array in diesem Format, keine zusätzlichen Erklärungen:
[
  {
    "title": "Artikel-Titel hier",
    "description": "Kurze Beschreibung des Artikels",
    "url": "https://example.com/artikel-url"
  }
]`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Du bist ein Trend-Recherche-Experte. Antworte immer nur mit validem JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';

    // Parse JSON from response - handle markdown code blocks
    let articles = [];
    try {
      // Remove markdown code blocks if present
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      articles = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      articles = [];
    }

    console.log('Found articles:', articles.length);

    return new Response(
      JSON.stringify({ articles }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in search-trend-articles:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, articles: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
