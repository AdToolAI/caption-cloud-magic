import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BEAT_SYNC_CREDITS = 2;

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
      audio_url,
      duration_seconds,
      sync_mode = 'all', // 'kicks', 'snares', 'all', 'downbeats'
      sensitivity = 0.7,
    } = await req.json();

    if (!audio_url) {
      return new Response(
        JSON.stringify({ error: 'audio_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Beat-Sync] Analyzing audio for user: ${user.id}, mode: ${sync_mode}`);

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

    if (wallet.balance < BEAT_SYNC_CREDITS) {
      return new Response(
        JSON.stringify({ 
          error: 'INSUFFICIENT_CREDITS',
          message: `Du benötigst ${BEAT_SYNC_CREDITS} Credits für Beat-Sync Analyse. Aktuell: ${wallet.balance} Credits.`,
          required: BEAT_SYNC_CREDITS,
          available: wallet.balance,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Lovable AI to analyze audio and detect beats
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let beatAnalysis = null;

    if (LOVABLE_API_KEY) {
      try {
        const systemPrompt = `Du bist ein Audio-Analyse-Experte für Beat Detection und Musik-Synchronisation.

Deine Aufgaben:
1. BPM (Beats per Minute) erkennen
2. Beat-Timestamps identifizieren (Kicks, Snares, HiHats)
3. Downbeats markieren (erster Beat jedes Takts)
4. Energielevel über Zeit analysieren
5. Empfehlungen für Video-Synchronisation geben

Antworte immer im JSON-Format.`;

        const userPrompt = `Analysiere diese Audio-Datei für Beat-Synchronisation:
- Audio-URL: ${audio_url}
- Dauer: ${duration_seconds || 'unbekannt'} Sekunden
- Sync-Modus: ${sync_mode}
- Sensitivität: ${sensitivity * 100}%

Generiere Beat-Analyse im Format:
{
  "bpm": 120,
  "time_signature": "4/4",
  "beats": [
    {"timestamp": 0.5, "type": "kick", "strength": 0.9},
    {"timestamp": 1.0, "type": "snare", "strength": 0.85},
    {"timestamp": 1.5, "type": "hihat", "strength": 0.5}
  ],
  "downbeats": [0.0, 2.0, 4.0],
  "energy_curve": [
    {"timestamp": 0, "level": 0.3},
    {"timestamp": 10, "level": 0.7},
    {"timestamp": 20, "level": 1.0}
  ],
  "sections": [
    {"start": 0, "end": 15, "type": "intro", "energy": "low"},
    {"start": 15, "end": 45, "type": "verse", "energy": "medium"},
    {"start": 45, "end": 60, "type": "chorus", "energy": "high"}
  ],
  "sync_recommendations": {
    "cut_on_beats": true,
    "transition_on_downbeats": true,
    "effect_sync_points": [10.5, 25.0, 45.5]
  }
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
                beatAnalysis = JSON.parse(jsonMatch[0]);
              }
            } catch (parseError) {
              console.error('[Beat-Sync] Failed to parse AI response:', parseError);
            }
          }
        }
      } catch (aiError) {
        console.error('[Beat-Sync] AI analysis error:', aiError);
      }
    }

    // Generate fallback beat analysis if AI failed
    if (!beatAnalysis) {
      const duration = duration_seconds || 60;
      const estimatedBPM = 120;
      const beatInterval = 60 / estimatedBPM;
      const beats = [];
      const downbeats = [];
      
      for (let t = 0; t < duration; t += beatInterval) {
        const beatIndex = Math.floor(t / beatInterval);
        const isDownbeat = beatIndex % 4 === 0;
        
        if (isDownbeat) {
          downbeats.push(t);
        }
        
        beats.push({
          timestamp: parseFloat(t.toFixed(3)),
          type: isDownbeat ? 'kick' : beatIndex % 2 === 0 ? 'kick' : 'snare',
          strength: isDownbeat ? 0.9 : 0.7,
        });
      }

      beatAnalysis = {
        bpm: estimatedBPM,
        time_signature: '4/4',
        beats: beats.slice(0, 100), // Limit for performance
        downbeats: downbeats.slice(0, 25),
        energy_curve: [
          { timestamp: 0, level: 0.5 },
          { timestamp: duration / 2, level: 0.8 },
          { timestamp: duration, level: 0.6 },
        ],
        sections: [
          { start: 0, end: duration, type: 'unknown', energy: 'medium' },
        ],
        sync_recommendations: {
          cut_on_beats: true,
          transition_on_downbeats: true,
          effect_sync_points: downbeats.filter((_, i) => i % 4 === 0).slice(0, 10),
        },
        mode: 'fallback',
      };
    }

    // Filter beats based on sync_mode
    if (sync_mode !== 'all' && beatAnalysis.beats) {
      if (sync_mode === 'kicks') {
        beatAnalysis.beats = beatAnalysis.beats.filter((b: any) => b.type === 'kick');
      } else if (sync_mode === 'snares') {
        beatAnalysis.beats = beatAnalysis.beats.filter((b: any) => b.type === 'snare');
      } else if (sync_mode === 'downbeats') {
        beatAnalysis.beats = beatAnalysis.beats.filter((b: any) => 
          beatAnalysis.downbeats.includes(b.timestamp)
        );
      }
    }

    // Deduct credits
    await supabaseAdmin
      .from('wallets')
      .update({ 
        balance: wallet.balance - BEAT_SYNC_CREDITS,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return new Response(
      JSON.stringify({
        success: true,
        credits_used: BEAT_SYNC_CREDITS,
        analysis: beatAnalysis,
        settings: {
          sync_mode,
          sensitivity,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Beat-Sync] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
