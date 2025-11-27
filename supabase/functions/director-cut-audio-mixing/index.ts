import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AUDIO_MIXING_CREDITS = 3;

interface AudioTrack {
  id: string;
  type: 'voice' | 'music' | 'sfx' | 'ambient';
  url?: string;
  volume: number;
  startTime: number;
  endTime: number;
}

interface MixingRecommendation {
  track_id: string;
  volume_keyframes: Array<{ time: number; volume: number }>;
  ducking_enabled: boolean;
  ducking_amount: number;
  eq_preset?: string;
  compression?: { threshold: number; ratio: number };
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
      audio_tracks,
      video_duration,
      speech_timestamps = [],
      mixing_style = 'balanced', // 'voice_priority', 'music_priority', 'balanced', 'cinematic'
    } = await req.json();

    if (!audio_tracks || !Array.isArray(audio_tracks) || audio_tracks.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least 1 audio track is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Director-Cut-Audio-Mixing] Analyzing ${audio_tracks.length} tracks for user: ${user.id}`);

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

    if (wallet.balance < AUDIO_MIXING_CREDITS) {
      return new Response(
        JSON.stringify({ 
          error: 'INSUFFICIENT_CREDITS',
          message: `Du benötigst ${AUDIO_MIXING_CREDITS} Credits für Audio-Mixing-Analyse. Aktuell: ${wallet.balance} Credits.`,
          required: AUDIO_MIXING_CREDITS,
          available: wallet.balance,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Lovable AI for mixing analysis
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let mixingAnalysis = null;

    if (LOVABLE_API_KEY) {
      try {
        const systemPrompt = `Du bist ein professioneller Audio-Engineer spezialisiert auf Multi-Track-Mixing für Videoproduktion.

Deine Aufgaben:
1. Analysiere Audio-Tracks und empfehle optimale Lautstärke-Verhältnisse
2. Generiere Auto-Ducking-Keyframes für Sprache-über-Musik
3. Empfehle EQ-Presets für verschiedene Track-Typen
4. Optimiere Kompression für konsistente Lautstärke

Mixing-Prioritäten nach Stil:
- voice_priority: Sprache immer dominant, Musik stark gedämpft bei Speech
- music_priority: Musik prominent, Sprache nur leicht verstärkt
- balanced: Gleichmäßige Verteilung mit intelligentem Ducking
- cinematic: Dramatische Dynamik, starke Kontraste

Standard-Lautstärke-Referenzen (0-100):
- Hauptsprache: 80-100
- Hintergrundmusik: 30-50
- SFX: 60-80
- Ambient: 20-40

Antworte immer im JSON-Format.`;

        const userPrompt = `Analysiere diese Audio-Tracks und generiere Mixing-Empfehlungen:

Audio-Tracks:
${JSON.stringify(audio_tracks, null, 2)}

Video-Dauer: ${video_duration || 'unbekannt'} Sekunden
Mixing-Stil: ${mixing_style}
Speech-Timestamps: ${speech_timestamps.length > 0 ? JSON.stringify(speech_timestamps.slice(0, 10)) : 'keine'}

Generiere Mixing-Analyse im Format:
{
  "recommendations": [
    {
      "track_id": "track_1",
      "track_type": "voice",
      "base_volume": 90,
      "volume_keyframes": [
        {"time": 0, "volume": 90},
        {"time": 10, "volume": 85}
      ],
      "ducking_enabled": false,
      "ducking_amount": 0,
      "eq_preset": "voice_clarity",
      "compression": {"threshold": -18, "ratio": 3}
    },
    {
      "track_id": "track_2",
      "track_type": "music",
      "base_volume": 45,
      "volume_keyframes": [
        {"time": 0, "volume": 45},
        {"time": 5, "volume": 25},
        {"time": 15, "volume": 45}
      ],
      "ducking_enabled": true,
      "ducking_amount": 40,
      "ducking_attack_ms": 50,
      "ducking_release_ms": 200,
      "eq_preset": "music_background",
      "compression": {"threshold": -12, "ratio": 2}
    }
  ],
  "master_settings": {
    "limiter_threshold": -1,
    "target_loudness": -14,
    "stereo_width": 100
  },
  "ducking_config": {
    "trigger_tracks": ["track_1"],
    "affected_tracks": ["track_2"],
    "ducking_curve": "smooth"
  },
  "style_applied": "${mixing_style}"
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
                mixingAnalysis = JSON.parse(jsonMatch[0]);
              }
            } catch (parseError) {
              console.error('[Director-Cut-Audio-Mixing] Failed to parse AI response:', parseError);
            }
          }
        }
      } catch (aiError) {
        console.error('[Director-Cut-Audio-Mixing] AI analysis error:', aiError);
      }
    }

    // Generate fallback mixing analysis if AI failed
    if (!mixingAnalysis) {
      const recommendations: MixingRecommendation[] = [];
      const voiceTracks: string[] = [];
      const musicTracks: string[] = [];
      
      for (const track of audio_tracks) {
        const isVoice = track.type === 'voice';
        const isMusic = track.type === 'music';
        const isSfx = track.type === 'sfx';
        
        let baseVolume = 50;
        let duckingEnabled = false;
        let duckingAmount = 0;
        
        if (isVoice) {
          baseVolume = mixing_style === 'music_priority' ? 75 : 90;
          voiceTracks.push(track.id);
        } else if (isMusic) {
          baseVolume = mixing_style === 'music_priority' ? 60 : 40;
          duckingEnabled = voiceTracks.length > 0;
          duckingAmount = mixing_style === 'voice_priority' ? 50 : 30;
          musicTracks.push(track.id);
        } else if (isSfx) {
          baseVolume = 70;
        } else {
          baseVolume = 30; // ambient
        }
        
        // Generate simple volume keyframes with ducking for music during speech
        const keyframes: Array<{ time: number; volume: number }> = [
          { time: 0, volume: baseVolume }
        ];
        
        if (isMusic && speech_timestamps.length > 0) {
          for (const speechTime of speech_timestamps) {
            const start = speechTime.start || speechTime;
            const end = speechTime.end || start + 5;
            
            keyframes.push(
              { time: Math.max(0, start - 0.5), volume: baseVolume },
              { time: start, volume: baseVolume - duckingAmount },
              { time: end, volume: baseVolume - duckingAmount },
              { time: end + 0.5, volume: baseVolume }
            );
          }
        }
        
        recommendations.push({
          track_id: track.id,
          volume_keyframes: keyframes,
          ducking_enabled: duckingEnabled,
          ducking_amount: duckingAmount,
          eq_preset: isVoice ? 'voice_clarity' : isMusic ? 'music_background' : 'neutral',
          compression: isVoice 
            ? { threshold: -18, ratio: 3 } 
            : { threshold: -12, ratio: 2 },
        });
      }

      mixingAnalysis = {
        recommendations,
        master_settings: {
          limiter_threshold: -1,
          target_loudness: -14,
          stereo_width: 100,
        },
        ducking_config: {
          trigger_tracks: voiceTracks,
          affected_tracks: musicTracks,
          ducking_curve: 'smooth',
        },
        style_applied: mixing_style,
        mode: 'fallback',
      };
    }

    // Deduct credits
    await supabaseAdmin
      .from('wallets')
      .update({ 
        balance: wallet.balance - AUDIO_MIXING_CREDITS,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return new Response(
      JSON.stringify({
        success: true,
        credits_used: AUDIO_MIXING_CREDITS,
        analysis: mixingAnalysis,
        track_count: audio_tracks.length,
        mixing_style,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Director-Cut-Audio-Mixing] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
