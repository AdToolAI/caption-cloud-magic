import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { basicIdea, style, mood } = await req.json();

    if (!basicIdea) {
      return new Response(
        JSON.stringify({ error: 'basicIdea is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `Du bist ein Experte für Video-Prompt-Engineering für Sora 2 AI.

Deine Aufgabe:
- Verwandle einfache Ideen in detaillierte, visuelle Beschreibungen
- Nutze filmische Begriffe (Kamerawinkel, Beleuchtung, Bewegung)
- Sei präzise und konkret, nicht abstrakt
- Vermeide: Text, Schrift, komplexe Dialoge, mehrere parallele Handlungen
- Länge: 1-2 Sätze (max. 50 Wörter)
- Schreibe IMMER auf Englisch (Sora 2 funktioniert besser mit englischen Prompts)

Beispiele:
Input: "Ein Hund spielt"
Output: "A playful golden retriever catching a frisbee in a sunny park, slow-motion capture of the jump, vibrant green grass, golden hour lighting, cinematic 4K"

Input: "Sonnenuntergang"
Output: "A breathtaking timelapse of the sun setting over a calm ocean, vibrant orange and purple hues reflecting on the water, wide-angle shot, 4K cinematic quality"

Erstelle NUR den optimierten Prompt in Englisch und gib zusätzlich 2-3 hilfreiche Tipps auf Deutsch.

Antworte im JSON-Format:
{
  "optimizedPrompt": "dein optimierter englischer Prompt hier",
  "tips": ["Tipp 1", "Tipp 2", "Tipp 3"]
}`;

    let userPrompt = `Optimiere diese Video-Idee: "${basicIdea}"`;
    if (style) userPrompt += `\nGewünschter Stil: ${style}`;
    if (mood) userPrompt += `\nGewünschte Stimmung: ${mood}`;

    console.log('Calling Lovable AI for prompt optimization...');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;
    console.log('AI response received');

    // Parse JSON response
    let parsedResult;
    try {
      const jsonMatch = aiContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : aiContent;
      parsedResult = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      throw new Error('Failed to parse AI response');
    }

    return new Response(
      JSON.stringify({
        optimizedPrompt: parsedResult.optimizedPrompt,
        tips: parsedResult.tips || []
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in optimize-video-prompt:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to optimize prompt' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
