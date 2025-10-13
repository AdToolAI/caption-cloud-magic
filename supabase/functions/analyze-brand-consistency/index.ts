import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== ANALYZE-BRAND-CONSISTENCY START ===');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const authHeader = req.headers.get('authorization');

    if (!lovableApiKey || !authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing configuration' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { brandKitId, contentId, contentType, content } = await req.json();

    console.log('Analyzing consistency for:', contentType, contentId);

    // Fetch brand kit
    const { data: brandKit, error: brandError } = await supabase
      .from('brand_kits')
      .select('*')
      .eq('id', brandKitId)
      .eq('user_id', userId)
      .single();

    if (brandError || !brandKit) {
      throw new Error('Brand kit not found');
    }

    // Build AI prompt for consistency analysis
    const prompt = `Du bist ein Experte für Marken-Konsistenz-Analyse.

Analysiere, wie gut der folgende Inhalt zur definierten Markenidentität passt:

MARKENIDENTITÄT:
- Name: ${brandKit.brand_name}
- Tonalität: ${brandKit.brand_tone}
- Stilrichtung: ${brandKit.style_direction}
- Primärfarbe: ${brandKit.color_palette.primary}
- Sekundärfarbe: ${brandKit.color_palette.secondary}
- Keywords: ${brandKit.keywords?.join(', ')}
- Emojis: ${brandKit.emoji_suggestions?.join(', ')}
- Brand Voice: ${JSON.stringify(brandKit.brand_voice)}

INHALT ZU ANALYSIEREN:
Typ: ${contentType}
${typeof content === 'string' ? `Text: ${content}` : `Daten: ${JSON.stringify(content)}`}

Bewerte die Konsistenz auf einer Skala von 0-100 und gib Feedback als JSON:
{
  "score": <Zahl zwischen 0-100>,
  "feedback": {
    "tone_match": <Passt die Tonalität? true/false>,
    "color_usage": <Wurden Markenfarben genutzt? true/false>,
    "emoji_usage": <Passt die Emoji-Nutzung? true/false>,
    "keyword_alignment": <Wurden relevante Keywords genutzt? true/false>,
    "voice_consistency": <Passt zum Brand Voice? true/false>
  },
  "suggestions": [
    "<Verbesserungsvorschlag 1>",
    "<Verbesserungsvorschlag 2>",
    "<Verbesserungsvorschlag 3>"
  ],
  "strengths": [
    "<Was gut gemacht wurde 1>",
    "<Was gut gemacht wurde 2>"
  ],
  "summary": "<2-3 Sätze Zusammenfassung>"
}

Gib NUR valides JSON zurück.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    let analysis;
    try {
      analysis = JSON.parse(aiContent);
    } catch {
      const jsonMatch = aiContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Could not parse AI response');
      }
    }

    // Save consistency history
    const { error: historyError } = await supabase
      .from('brand_consistency_history')
      .insert({
        brand_kit_id: brandKitId,
        user_id: userId,
        score: analysis.score,
        content_id: contentId,
        content_type: contentType,
        feedback: analysis
      });

    if (historyError) {
      console.warn('Could not save history:', historyError.message);
    }

    // Update brand kit's average consistency score
    const { data: historyData } = await supabase
      .from('brand_consistency_history')
      .select('score')
      .eq('brand_kit_id', brandKitId)
      .order('analyzed_at', { ascending: false })
      .limit(10);

    if (historyData && historyData.length > 0) {
      const avgScore = Math.round(
        historyData.reduce((sum, item) => sum + item.score, 0) / historyData.length
      );

      await supabase
        .from('brand_kits')
        .update({ 
          consistency_score: avgScore,
          last_consistency_check: new Date().toISOString()
        })
        .eq('id', brandKitId);
    }

    console.log('Consistency analysis completed:', analysis.score);
    console.log('=== ANALYZE-BRAND-CONSISTENCY END (SUCCESS) ===');

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('=== ANALYZE-BRAND-CONSISTENCY ERROR ===');
    console.error('Error:', error.message);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Analysis failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});