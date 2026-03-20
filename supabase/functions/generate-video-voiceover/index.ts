import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Top ElevenLabs voices with their IDs
const VOICE_MAP: Record<string, string> = {
  'aria': '9BWtsMINqrJLrRacOk9x',
  'roger': 'CwhRBWXzGAHq8TQ4Fs17',
  'sarah': 'EXAVITQu4vr4xnSDxMaL',
  'laura': 'FGY2WhTYpPnrIDTdsKH5',
  'charlie': 'IKne3meq5aSn9XLyUdCD',
  'george': 'JBFqnCBsd6RMkjVDRZzb',
  'callum': 'N2lVS1w4EtoT3dr4eOWO',
  'river': 'SAz9YHcvj6GT2YYXdXww',
  'liam': 'TX3LPaxmHKxFdv7VOQHJ',
  'charlotte': 'XB0fDUnXU5powFXDhCwa',
  'alice': 'Xb7hH8MSUJpSbSDYk0k2',
  'matilda': 'XrExE9yKIg1WjnnlVkGX',
  'will': 'bIHbv24MWmeRgasZH58o',
  'jessica': 'cgSgspJ2msm6clMCkdW9',
  'eric': 'cjVigY5qzO86Huf0OWal',
  'chris': 'iP95p4xoKVk53GoZ742B',
  'brian': 'nPczCjzI2devNBz1zQrb',
  'daniel': 'onwK4e9ZLuTAKqWW03F9',
  'lily': 'pFZP5JQG7iQjIQuC4Bku',
  'bill': 'pqHfZKP75CvOlQylNhV4',
};

// Gender-to-voice mapping for when callers send voiceGender instead of voice name
const GENDER_MAP: Record<string, string> = {
  'male': 'roger',
  'female': 'sarah',
  'männlich': 'roger',
  'weiblich': 'sarah',
};

function resolveVoice(voice?: string, voiceGender?: string): string {
  // If voice is a known name or ID, use it directly
  if (voice && (VOICE_MAP[voice.toLowerCase()] || voice.length > 10)) {
    return voice;
  }
  // If voice is actually a gender string, map it
  if (voice && GENDER_MAP[voice.toLowerCase()]) {
    return GENDER_MAP[voice.toLowerCase()];
  }
  // If voiceGender is provided, map it
  if (voiceGender && GENDER_MAP[voiceGender.toLowerCase()]) {
    return GENDER_MAP[voiceGender.toLowerCase()];
  }
  // Default
  return 'aria';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { scriptText, speed = 1.0, withTimestamps = false } = body;
    const voice = resolveVoice(body.voice, body.voiceGender);

    if (!scriptText) {
      throw new Error('scriptText is required');
    }

    console.log('[generate-video-voiceover] Starting with:', {
      scriptLength: scriptText.length,
      voice,
      speed,
      withTimestamps,
      voiceId: VOICE_MAP[voice.toLowerCase()] || voice
    });

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    // Get voice ID from map or use as-is if it's already an ID
    const voiceId = VOICE_MAP[voice.toLowerCase()] || voice;

    // ✅ NEW: Use with-timestamps endpoint for lip-sync data
    const endpoint = withTimestamps 
      ? `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`
      : `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    // Call ElevenLabs TTS API (Turbo v2.5 for best quality/speed)
    const ttsResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: scriptText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true,
        },
      }),
    });

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error('[generate-video-voiceover] ElevenLabs error:', errorText);
      throw new Error(`ElevenLabs TTS failed: ${errorText}`);
    }

    let audioBuffer: ArrayBuffer;
    let alignmentData: any = null;

    // ✅ Handle different response formats
    if (withTimestamps) {
      // With timestamps returns JSON with base64 audio + alignment
      const jsonResponse = await ttsResponse.json();
      
      // Decode base64 audio
      const base64Audio = jsonResponse.audio_base64;
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      audioBuffer = bytes.buffer;
      
      // Extract alignment data for lip-sync
      alignmentData = jsonResponse.alignment;
      
      console.log('[generate-video-voiceover] Timestamps received:', {
        characters: alignmentData?.characters?.length || 0,
        hasStartTimes: !!alignmentData?.character_start_times_seconds,
        hasEndTimes: !!alignmentData?.character_end_times_seconds,
      });
    } else {
      // Standard endpoint returns audio directly
      audioBuffer = await ttsResponse.arrayBuffer();
    }

    console.log('[generate-video-voiceover] Audio generated', {
      sizeBytes: audioBuffer.byteLength,
      hasAlignment: !!alignmentData,
    });

    // Upload to Supabase Storage
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    let userId = 'anonymous';

    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) userId = user.id;
    }

    const fileName = `${userId}/${Date.now()}-voiceover.mp3`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('voiceover-audio')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[generate-video-voiceover] Storage upload error:', uploadError);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('voiceover-audio')
      .getPublicUrl(uploadData.path);

    console.log('[generate-video-voiceover] Success', { publicUrl, hasAlignment: !!alignmentData });

    // Estimate duration (rough: ~150 words/min, ~5 chars/word)
    const estimatedDuration = Math.max(3, (scriptText.length / 5 / 150) * 60);

    // ✅ Build response with optional alignment data for lip-sync
    const responseData: any = {
      ok: true,
      audioUrl: publicUrl,
      duration: estimatedDuration,
      voiceUsed: voice,
      scriptLength: scriptText.length,
    };

    // ✅ Include alignment data if timestamps were requested
    if (alignmentData) {
      responseData.alignment = {
        characters: alignmentData.characters || [],
        character_start_times_seconds: alignmentData.character_start_times_seconds || [],
        character_end_times_seconds: alignmentData.character_end_times_seconds || [],
      };
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[generate-video-voiceover] Error:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
