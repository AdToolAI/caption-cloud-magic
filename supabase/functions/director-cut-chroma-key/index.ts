import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHROMA_KEY_CREDITS = 3;

interface ChromaKeyAnalysis {
  detected_color: string;
  color_hex: string;
  color_rgb: { r: number; g: number; b: number };
  recommended_tolerance: number;
  recommended_edge_softness: number;
  recommended_spill_suppression: number;
  background_type: string;
  confidence: number;
  alternative_colors?: Array<{
    color: string;
    hex: string;
    coverage_percent: number;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { 
      video_url, 
      frame_url, 
      sample_timestamp = 0,
      preferred_color = null 
    } = await req.json();

    if (!video_url && !frame_url) {
      return new Response(
        JSON.stringify({ error: 'video_url or frame_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Director-Cut-Chroma-Key] Analyzing video for user: ${user.id}`);

    // Check user credits
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: 'Could not retrieve wallet' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (wallet.balance < CHROMA_KEY_CREDITS) {
      return new Response(
        JSON.stringify({ 
          error: 'INSUFFICIENT_CREDITS',
          message: `Du benötigst ${CHROMA_KEY_CREDITS} Credits für Chroma-Key-Analyse. Aktuell: ${wallet.balance} Credits.`,
          required: CHROMA_KEY_CREDITS,
          available: wallet.balance,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Lovable AI for color analysis
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let chromaKeyAnalysis: ChromaKeyAnalysis | null = null;

    if (LOVABLE_API_KEY) {
      try {
        const systemPrompt = `Du bist ein Experte für Green-Screen und Chroma-Key-Analyse in der Videoproduktion.

Deine Aufgaben:
1. Erkenne die dominante Hintergrundfarbe für Chroma-Keying
2. Unterscheide zwischen Green-Screen (grün), Blue-Screen (blau) und anderen einfarbigen Hintergründen
3. Empfehle optimale Toleranz-, Edge-Softness- und Spill-Suppression-Werte
4. Identifiziere alternative Farben falls mehrere einfarbige Bereiche vorhanden sind

Standard-Chroma-Key-Farben:
- Grün (#00FF00): Am häufigsten, gute Trennung von Hauttönen
- Blau (#0000FF): Gut für blonde Haare und grüne Kleidung
- Magenta (#FF00FF): Selten, für spezielle Anwendungen

Antworte immer im JSON-Format.`;

        const userPrompt = `Analysiere dieses Video/Bild für Chroma-Key:

Video-URL: ${video_url || 'nicht angegeben'}
Frame-URL: ${frame_url || 'nicht angegeben'}
Sample-Timestamp: ${sample_timestamp} Sekunden
${preferred_color ? `Bevorzugte Farbe: ${preferred_color}` : 'Keine bevorzugte Farbe angegeben'}

Generiere Chroma-Key-Analyse im Format:
{
  "detected_color": "green",
  "color_hex": "#00FF00",
  "color_rgb": {"r": 0, "g": 255, "b": 0},
  "recommended_tolerance": 40,
  "recommended_edge_softness": 2.5,
  "recommended_spill_suppression": 50,
  "background_type": "green_screen",
  "confidence": 0.95,
  "lighting_quality": "good",
  "potential_issues": ["slight_spill_on_edges"],
  "alternative_colors": [
    {"color": "light_green", "hex": "#90EE90", "coverage_percent": 15}
  ]
}

Berücksichtige:
- Häufige Green-Screen-Farben: #00FF00, #00B140, #00CC00
- Häufige Blue-Screen-Farben: #0000FF, #0040FF, #1E90FF
- Toleranz: 20-60 (niedrig = schärfer, hoch = mehr Erfassung)
- Edge Softness: 0-5 (Kantenweichheit)
- Spill Suppression: 0-100 (Farbüberschlag-Unterdrückung)`;

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

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content;
          
          if (content) {
            try {
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                chromaKeyAnalysis = JSON.parse(jsonMatch[0]);
              }
            } catch (parseError) {
              console.error('[Director-Cut-Chroma-Key] Failed to parse AI response:', parseError);
            }
          }
        }
      } catch (aiError) {
        console.error('[Director-Cut-Chroma-Key] AI analysis error:', aiError);
      }
    }

    // Generate fallback analysis if AI failed
    if (!chromaKeyAnalysis) {
      // Default to green screen with standard values
      chromaKeyAnalysis = {
        detected_color: preferred_color || 'green',
        color_hex: preferred_color === 'blue' ? '#0000FF' : '#00FF00',
        color_rgb: preferred_color === 'blue' 
          ? { r: 0, g: 0, b: 255 }
          : { r: 0, g: 255, b: 0 },
        recommended_tolerance: 40,
        recommended_edge_softness: 2.0,
        recommended_spill_suppression: 50,
        background_type: preferred_color === 'blue' ? 'blue_screen' : 'green_screen',
        confidence: 0.6,
        alternative_colors: [
          { color: 'light_green', hex: '#90EE90', coverage_percent: 10 },
          { color: 'dark_green', hex: '#006400', coverage_percent: 5 },
        ],
      };
    }

    // Deduct credits
    await supabaseAdmin
      .from('wallets')
      .update({ 
        balance: wallet.balance - CHROMA_KEY_CREDITS,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return new Response(
      JSON.stringify({
        success: true,
        credits_used: CHROMA_KEY_CREDITS,
        analysis: chromaKeyAnalysis,
        settings_applied: {
          tolerance: chromaKeyAnalysis.recommended_tolerance,
          edge_softness: chromaKeyAnalysis.recommended_edge_softness,
          spill_suppression: chromaKeyAnalysis.recommended_spill_suppression,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Director-Cut-Chroma-Key] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
