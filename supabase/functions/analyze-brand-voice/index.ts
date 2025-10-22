import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== ANALYZE-BRAND-VOICE START ===');
  
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

    // Extract user ID from token
    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { textSamples, brandKitId } = await req.json();

    console.log('Analyzing voice for brand kit:', brandKitId);

    // Build AI prompt for voice analysis
    const prompt = `Du bist ein Experte für Marken-Tonalität und Schreibstil-Analyse.

Analysiere die folgenden Text-Samples und erstelle ein detailliertes Brand Voice Profil:

${textSamples.map((sample: string, idx: number) => `
Sample ${idx + 1}:
${sample}
`).join('\n')}

Erstelle eine Brand Voice Analyse als JSON mit folgender Struktur:
{
  "tone": "<Ton: z.B. freundlich, professionell, inspirierend, frech>",
  "style": "<Stil: z.B. erzählerisch, kurz & knackig, detailliert>",
  "pacing": "<Tempo: z.B. schnell, gemächlich, ausgewogen>",
  "emoji_use": "<Emoji-Nutzung: z.B. häufig, selten, gezielt>",
  "hashtag_style": "<Hashtag-Stil: z.B. viele, wenige, thematisch>",
  "personality_traits": ["<Merkmal 1>", "<Merkmal 2>", "<Merkmal 3>"],
  "vocabulary_level": "<Wortschatz: z.B. einfach, gehoben, fachlich>",
  "sentence_structure": "<Satzstruktur: z.B. kurze Sätze, lange Sätze, gemischt>",
  "call_to_action_style": "<CTA-Stil: z.B. direkt, subtil, inspirierend>",
  "storytelling_approach": "<Storytelling: z.B. persönlich, sachlich, emotional>",
  "voice_summary": "<2-3 Sätze Zusammenfassung der Marken-Stimme>"
}

Gib NUR valides JSON zurück, keine Erklärungen außerhalb des JSON.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    // Parse AI response
    let voiceProfile;
    try {
      voiceProfile = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        voiceProfile = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Could not parse AI response');
      }
    }

    // Update brand kit with voice profile
    const { error: updateError } = await supabase
      .from('brand_kits')
      .update({ 
        brand_voice: voiceProfile,
        updated_at: new Date().toISOString()
      })
      .eq('id', brandKitId)
      .eq('user_id', userId);

    if (updateError) throw updateError;

    // Save voice samples
    for (const sample of textSamples) {
      await supabase
        .from('brand_voice_samples')
        .insert({
          brand_kit_id: brandKitId,
          user_id: userId,
          sample_text: sample,
          analyzed_attributes: voiceProfile
        });
    }

    console.log('Voice analysis completed successfully');
    console.log('=== ANALYZE-BRAND-VOICE END (SUCCESS) ===');

    return new Response(JSON.stringify({ voiceProfile }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('=== ANALYZE-BRAND-VOICE ERROR ===');
    console.error('Error:', error.message);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Analysis failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});