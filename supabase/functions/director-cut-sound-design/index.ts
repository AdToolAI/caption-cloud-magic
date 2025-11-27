import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOUND_DESIGN_CREDITS = 5;

// Predefined sound categories with sample URLs
const AMBIENT_SOUNDS = {
  nature: [
    { name: 'Forest Birds', category: 'nature', mood: 'peaceful' },
    { name: 'Ocean Waves', category: 'nature', mood: 'calm' },
    { name: 'Rain on Window', category: 'nature', mood: 'melancholic' },
    { name: 'Wind Through Trees', category: 'nature', mood: 'mysterious' },
  ],
  urban: [
    { name: 'City Traffic', category: 'urban', mood: 'busy' },
    { name: 'Cafe Ambience', category: 'urban', mood: 'cozy' },
    { name: 'Office Background', category: 'urban', mood: 'professional' },
    { name: 'Street Market', category: 'urban', mood: 'vibrant' },
  ],
  tech: [
    { name: 'Server Room', category: 'tech', mood: 'futuristic' },
    { name: 'Digital Hum', category: 'tech', mood: 'modern' },
    { name: 'Keyboard Typing', category: 'tech', mood: 'productive' },
  ],
  emotional: [
    { name: 'Tension Drone', category: 'emotional', mood: 'tense' },
    { name: 'Hopeful Pad', category: 'emotional', mood: 'inspiring' },
    { name: 'Sad Piano Ambience', category: 'emotional', mood: 'sad' },
    { name: 'Epic Build', category: 'emotional', mood: 'epic' },
  ],
};

const SFX_LIBRARY = {
  transitions: ['Whoosh', 'Swipe', 'Glitch', 'Impact', 'Rise'],
  ui: ['Click', 'Pop', 'Notification', 'Success', 'Error'],
  motion: ['Footsteps', 'Door', 'Car Pass', 'Wind Gust'],
  accents: ['Cymbal Swell', 'Bass Drop', 'Stinger', 'Hit'],
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
      scenes = [],
      detected_mood,
      generate_ambient = true,
      generate_sfx = true,
      generate_foley = true,
    } = await req.json();

    console.log(`[Sound Design] Analyzing for user: ${user.id}, scenes: ${scenes.length}`);

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

    if (wallet.balance < SOUND_DESIGN_CREDITS) {
      return new Response(
        JSON.stringify({ 
          error: 'INSUFFICIENT_CREDITS',
          message: `Du benötigst ${SOUND_DESIGN_CREDITS} Credits für AI Sound Design. Aktuell: ${wallet.balance} Credits.`,
          required: SOUND_DESIGN_CREDITS,
          available: wallet.balance,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Lovable AI to analyze scenes and suggest sounds
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let aiRecommendations = null;

    if (LOVABLE_API_KEY) {
      try {
        const systemPrompt = `Du bist ein professioneller Sound Designer für Videos. Analysiere Szenen und empfehle passende Audio-Elemente.

Kategorien:
- Ambient: Hintergrundatmosphäre (Natur, Stadt, Technik, Emotional)
- SFX: Soundeffekte für Übergänge und Akzente
- Foley: Realistische Geräusche für Aktionen

Berücksichtige:
- Stimmung jeder Szene
- Übergänge zwischen Szenen
- Gesamtatmosphäre des Videos`;

        const scenesDescription = scenes.map((s: any, i: number) => 
          `Szene ${i + 1} (${s.startTime}s-${s.endTime}s): ${s.description || 'Keine Beschreibung'}, Stimmung: ${s.mood || 'unbekannt'}`
        ).join('\n');

        const userPrompt = `Analysiere diese Szenen und empfehle Sound Design:

${scenesDescription || 'Keine Szenen-Details verfügbar'}

Erkannte Gesamtstimmung: ${detected_mood || 'unbekannt'}

Generiere Empfehlungen im Format:
{
  "ambient": {
    "primary": {"name": "...", "category": "...", "mood": "..."},
    "secondary": {"name": "...", "category": "...", "mood": "..."}
  },
  "sfx_placements": [
    {"timestamp": 0.0, "type": "transition", "name": "Whoosh", "reason": "Szenenstart"}
  ],
  "foley_suggestions": [
    {"timestamp": 2.5, "type": "footsteps", "reason": "Person geht"}
  ],
  "volume_recommendations": {
    "ambient_level": 0.3,
    "sfx_level": 0.7,
    "foley_level": 0.5
  },
  "mixing_notes": "..."
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
                aiRecommendations = JSON.parse(jsonMatch[0]);
              }
            } catch (parseError) {
              console.error('[Sound Design] Failed to parse AI response:', parseError);
            }
          }
        }
      } catch (aiError) {
        console.error('[Sound Design] AI analysis error:', aiError);
      }
    }

    // Generate fallback recommendations if AI failed
    if (!aiRecommendations) {
      const moodCategory = detected_mood === 'energetic' ? 'urban' : 
                          detected_mood === 'calm' ? 'nature' : 
                          detected_mood === 'professional' ? 'tech' : 'emotional';
      
      aiRecommendations = {
        ambient: {
          primary: AMBIENT_SOUNDS[moodCategory as keyof typeof AMBIENT_SOUNDS]?.[0] || AMBIENT_SOUNDS.nature[0],
          secondary: AMBIENT_SOUNDS.emotional[1],
        },
        sfx_placements: scenes.map((s: any, i: number) => ({
          timestamp: s.startTime || i * 5,
          type: 'transition',
          name: SFX_LIBRARY.transitions[i % SFX_LIBRARY.transitions.length],
          reason: 'Szenenübergang',
        })),
        foley_suggestions: [],
        volume_recommendations: {
          ambient_level: 0.25,
          sfx_level: 0.6,
          foley_level: 0.5,
        },
        mixing_notes: 'Standard-Mix empfohlen. Ambient leise im Hintergrund, SFX für Akzente.',
        mode: 'fallback',
      };
    }

    // Deduct credits
    await supabaseAdmin
      .from('wallets')
      .update({ 
        balance: wallet.balance - SOUND_DESIGN_CREDITS,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return new Response(
      JSON.stringify({
        success: true,
        credits_used: SOUND_DESIGN_CREDITS,
        recommendations: aiRecommendations,
        available_sounds: {
          ambient: AMBIENT_SOUNDS,
          sfx: SFX_LIBRARY,
        },
        settings: {
          generate_ambient,
          generate_sfx,
          generate_foley,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Sound Design] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
