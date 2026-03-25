import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestSchema = z.object({
      description: z.string().max(2000).optional().default(''),
      platform: z.string().regex(/^[a-zA-Z]+$/).max(50).default('instagram'),
      language: z.string().regex(/^[a-z]{2}$/).default('de'),
      tone: z.string().max(50).default('professional'),
      media_url: z.string().url().max(2000).optional(),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { description, platform, language, tone, media_url } = validation.data;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const langMap: Record<string, string> = { de: 'Deutsch', en: 'English', es: 'Español' };
    const langName = langMap[language] || 'Deutsch';

    let mediaContext = '';
    if (media_url) {
      mediaContext = `\n\nEin Bild/Video ist beigefügt (URL: ${media_url}). Analysiere den visuellen Inhalt und erstelle die Caption passend zum Medium.`;
    }

    const prompt = `Du bist ein professioneller Social-Media-Texter. Schreibe auf ${langName}.

Erstelle eine ansprechende ${platform}-Caption im Ton "${tone}" zum Thema: "${description || 'Social Media Post'}"${mediaContext}

Die Caption soll:
- Maximal 250 Zeichen für Instagram/TikTok, 300 für LinkedIn
- Emotional und engaging sein
- Zum Handeln auffordern

Erstelle außerdem 5-8 relevante Hashtags.

Antworte NUR mit einem JSON-Objekt:
{
  "caption": "deine caption hier",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}`;

    const messages: any[] = [{ role: 'user', content: prompt }];

    // If media_url provided, use vision model with image
    if (media_url) {
      messages[0] = {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: media_url } }
        ]
      };
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      throw new Error(`AI API failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const text = aiData.choices?.[0]?.message?.content || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ caption: text.slice(0, 300), hashtags: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return new Response(
      JSON.stringify({
        caption: parsed.caption || '',
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-post-caption:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate caption' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
