import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AUTO_CUT_CREDITS = 3;

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
      audio_url,
      duration_seconds,
      mode = 'balanced', // 'fast', 'balanced', 'detailed'
      target_clip_duration = 3,
      sensitivity = 0.5,
    } = await req.json();

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: 'video_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Auto-Cut] Analyzing video for user: ${user.id}, mode: ${mode}`);

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

    if (wallet.balance < AUTO_CUT_CREDITS) {
      return new Response(
        JSON.stringify({ 
          error: 'INSUFFICIENT_CREDITS',
          message: `Du benötigst ${AUTO_CUT_CREDITS} Credits für AI Auto-Cut. Aktuell: ${wallet.balance} Credits.`,
          required: AUTO_CUT_CREDITS,
          available: wallet.balance,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Lovable AI to analyze video and suggest cuts
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let aiAnalysis = null;

    if (LOVABLE_API_KEY) {
      try {
        const systemPrompt = `Du bist ein professioneller Video-Editor-Assistent. Analysiere Videos und schlage optimale Schnittpunkte vor.

Deine Aufgaben:
1. Beat-Sync: Identifiziere musikalische Beats und Rhythmuswechsel für Schnitte
2. Speech-Pause: Erkenne Sprechpausen für natürliche Übergänge
3. Action Detection: Finde Bewegungsänderungen und Szenenwechsel
4. Pacing: Schlage Schnitte vor, die zum Tempo des Videos passen

Antworte immer im JSON-Format mit einer cuts-Array.`;

        const userPrompt = `Analysiere dieses Video und schlage Schnittpunkte vor:
- Video-URL: ${video_url}
- Audio-URL: ${audio_url || 'Keine separate Audio-Datei'}
- Videodauer: ${duration_seconds || 'unbekannt'} Sekunden
- Modus: ${mode} (${mode === 'fast' ? 'weniger Schnitte' : mode === 'detailed' ? 'mehr Schnitte' : 'ausgewogen'})
- Ziel-Clip-Dauer: ~${target_clip_duration} Sekunden pro Clip
- Sensitivität: ${sensitivity * 100}%

Generiere Schnittvorschläge im Format:
{
  "cuts": [
    {
      "timestamp": 0.0,
      "type": "scene_start",
      "confidence": 1.0,
      "reason": "Video-Anfang"
    },
    {
      "timestamp": 3.5,
      "type": "beat_sync",
      "confidence": 0.85,
      "reason": "Musikalischer Beat"
    }
  ],
  "detected_bpm": 120,
  "speech_segments": [{"start": 1.0, "end": 4.5}],
  "action_peaks": [{"timestamp": 2.3, "intensity": 0.7}],
  "recommended_transitions": ["cut", "crossfade"]
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
                aiAnalysis = JSON.parse(jsonMatch[0]);
              }
            } catch (parseError) {
              console.error('[Auto-Cut] Failed to parse AI response:', parseError);
            }
          }
        }
      } catch (aiError) {
        console.error('[Auto-Cut] AI analysis error:', aiError);
      }
    }

    // Generate fallback cuts if AI analysis failed
    if (!aiAnalysis || !aiAnalysis.cuts) {
      const videoDuration = duration_seconds || 30;
      const numCuts = Math.ceil(videoDuration / target_clip_duration);
      const cuts = [];
      
      for (let i = 0; i < numCuts; i++) {
        const timestamp = i * target_clip_duration;
        if (timestamp < videoDuration) {
          cuts.push({
            timestamp,
            type: i === 0 ? 'scene_start' : 'auto_interval',
            confidence: 0.6,
            reason: i === 0 ? 'Video-Anfang' : `Automatischer Schnitt (${target_clip_duration}s Intervall)`,
          });
        }
      }

      aiAnalysis = {
        cuts,
        detected_bpm: null,
        speech_segments: [],
        action_peaks: [],
        recommended_transitions: ['cut'],
        mode: 'fallback',
      };
    }

    // Deduct credits
    await supabaseAdmin
      .from('wallets')
      .update({ 
        balance: wallet.balance - AUTO_CUT_CREDITS,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return new Response(
      JSON.stringify({
        success: true,
        credits_used: AUTO_CUT_CREDITS,
        analysis: aiAnalysis,
        settings: {
          mode,
          target_clip_duration,
          sensitivity,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Auto-Cut] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
