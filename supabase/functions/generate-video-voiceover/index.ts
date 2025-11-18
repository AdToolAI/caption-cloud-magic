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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { scriptText, voice = 'aria', speed = 1.0 } = await req.json();

    if (!scriptText) {
      throw new Error('scriptText is required');
    }

    console.log('[generate-video-voiceover] Generating voiceover', {
      scriptLength: scriptText.length,
      voice,
      speed,
    });

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    // Get voice ID from map or use as-is if it's already an ID
    const voiceId = VOICE_MAP[voice.toLowerCase()] || voice;

    // Call ElevenLabs TTS API (Turbo v2.5 for best quality/speed)
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
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
      }
    );

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error('[generate-video-voiceover] ElevenLabs error:', errorText);
      throw new Error(`ElevenLabs TTS failed: ${errorText}`);
    }

    // Get audio as ArrayBuffer
    const audioBuffer = await ttsResponse.arrayBuffer();
    console.log('[generate-video-voiceover] Audio generated', {
      sizeBytes: audioBuffer.byteLength,
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

    console.log('[generate-video-voiceover] Success', { publicUrl });

    // Estimate duration (rough: ~150 words/min, ~5 chars/word)
    const estimatedDuration = Math.max(3, (scriptText.length / 5 / 150) * 60);

    return new Response(
      JSON.stringify({
        ok: true,
        audioUrl: publicUrl,
        duration: estimatedDuration,
        voiceUsed: voice,
        scriptLength: scriptText.length,
      }),
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
