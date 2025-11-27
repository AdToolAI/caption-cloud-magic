import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SMART_CROP_CREDITS = 5;

// Supported aspect ratios with their dimensions
const ASPECT_RATIOS = {
  '16:9': { width: 1920, height: 1080, name: 'Landscape (YouTube)' },
  '9:16': { width: 1080, height: 1920, name: 'Portrait (TikTok/Reels)' },
  '1:1': { width: 1080, height: 1080, name: 'Square (Instagram)' },
  '4:5': { width: 1080, height: 1350, name: 'Portrait (Instagram Feed)' },
  '4:3': { width: 1440, height: 1080, name: 'Classic TV' },
  '21:9': { width: 2560, height: 1080, name: 'Cinematic Ultrawide' },
};

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
      source_aspect_ratio = '16:9',
      target_aspect_ratios = ['9:16', '1:1'],
      duration_seconds,
      scenes = [],
      tracking_mode = 'auto', // 'auto', 'face', 'center', 'custom'
    } = await req.json();

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: 'video_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Smart Crop] Analyzing for user: ${user.id}, targets: ${target_aspect_ratios.join(', ')}`);

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

    if (wallet.balance < SMART_CROP_CREDITS) {
      return new Response(
        JSON.stringify({ 
          error: 'INSUFFICIENT_CREDITS',
          message: `Du benötigst ${SMART_CROP_CREDITS} Credits für Smart Cropping. Aktuell: ${wallet.balance} Credits.`,
          required: SMART_CROP_CREDITS,
          available: wallet.balance,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Lovable AI to analyze video and detect subjects
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let cropAnalysis = null;

    if (LOVABLE_API_KEY) {
      try {
        const systemPrompt = `Du bist ein Experte für Video-Reframing und Subjekt-Tracking.

Deine Aufgaben:
1. Hauptsubjekte im Video identifizieren (Personen, Objekte, Text)
2. Fokuspunkte pro Szene/Zeitabschnitt berechnen
3. Optimale Crop-Bereiche für verschiedene Aspect Ratios vorschlagen
4. Bewegungspfade für Tracking generieren

Berücksichtige:
- Regel der Drittel
- Blickrichtung von Personen
- Wichtige Bildelelemente nicht abschneiden
- Sanfte Übergänge bei Tracking`;

        const scenesDescription = scenes.map((s: any, i: number) => 
          `Szene ${i + 1} (${s.startTime}s-${s.endTime}s): ${s.description || 'Keine Beschreibung'}`
        ).join('\n');

        const userPrompt = `Analysiere dieses Video für Smart Cropping:
- Video-URL: ${video_url}
- Quell-Format: ${source_aspect_ratio}
- Ziel-Formate: ${target_aspect_ratios.join(', ')}
- Dauer: ${duration_seconds || 'unbekannt'} Sekunden
- Tracking-Modus: ${tracking_mode}

Szenen:
${scenesDescription || 'Keine Szenen-Details verfügbar'}

Generiere Crop-Analyse im Format:
{
  "detected_subjects": [
    {"type": "person", "importance": 0.9, "typical_position": {"x": 0.5, "y": 0.4}},
    {"type": "text", "importance": 0.7, "typical_position": {"x": 0.5, "y": 0.8}}
  ],
  "focus_points": [
    {"timestamp": 0, "x": 0.5, "y": 0.5, "reason": "Zentrierte Person"},
    {"timestamp": 5, "x": 0.3, "y": 0.4, "reason": "Person bewegt sich nach links"}
  ],
  "crop_suggestions": {
    "9:16": {
      "default_offset": {"x": 0.5, "y": 0.5},
      "keyframes": [
        {"timestamp": 0, "x": 0.5, "y": 0.5},
        {"timestamp": 5, "x": 0.3, "y": 0.5}
      ]
    },
    "1:1": {
      "default_offset": {"x": 0.5, "y": 0.4},
      "keyframes": []
    }
  },
  "tracking_path": [
    {"timestamp": 0, "x": 0.5, "y": 0.5},
    {"timestamp": 2.5, "x": 0.45, "y": 0.48},
    {"timestamp": 5, "x": 0.3, "y": 0.45}
  ],
  "warnings": ["Text am unteren Rand könnte bei 9:16 abgeschnitten werden"]
}`;

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
                cropAnalysis = JSON.parse(jsonMatch[0]);
              }
            } catch (parseError) {
              console.error('[Smart Crop] Failed to parse AI response:', parseError);
            }
          }
        }
      } catch (aiError) {
        console.error('[Smart Crop] AI analysis error:', aiError);
      }
    }

    // Generate fallback crop analysis if AI failed
    if (!cropAnalysis) {
      const cropSuggestions: Record<string, any> = {};
      
      for (const ratio of target_aspect_ratios) {
        cropSuggestions[ratio] = {
          default_offset: { x: 0.5, y: 0.5 },
          keyframes: [],
        };
      }

      cropAnalysis = {
        detected_subjects: [
          { type: 'unknown', importance: 0.5, typical_position: { x: 0.5, y: 0.5 } },
        ],
        focus_points: [
          { timestamp: 0, x: 0.5, y: 0.5, reason: 'Standard-Zentrierung' },
        ],
        crop_suggestions: cropSuggestions,
        tracking_path: [
          { timestamp: 0, x: 0.5, y: 0.5 },
        ],
        warnings: ['Fallback-Modus: Zentriertes Cropping ohne Subjekt-Erkennung'],
        mode: 'fallback',
      };
    }

    // Deduct credits
    await supabaseAdmin
      .from('wallets')
      .update({ 
        balance: wallet.balance - SMART_CROP_CREDITS,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return new Response(
      JSON.stringify({
        success: true,
        credits_used: SMART_CROP_CREDITS,
        analysis: cropAnalysis,
        available_ratios: ASPECT_RATIOS,
        settings: {
          source_aspect_ratio,
          target_aspect_ratios,
          tracking_mode,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Smart Crop] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
