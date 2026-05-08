// supabase/functions/generate-multi-speaker-vo/index.ts
// Generates per-segment TTS audio for a multi-speaker script.
// - Accepts: { segments:[{speakerId,text}], speakerMap:{[speakerId]:{engine,voiceId,...}} }
// - Returns: { segments:[{speakerId,text,audioBase64,mime,engine,voiceId,durationMs?}] }
// Stitching is done client-side (WebAudio → WAV) so we keep this fast and stateless.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

interface SpeakerVoiceCfg {
  engine: 'elevenlabs' | 'hume';
  voiceId: string;            // ElevenLabs voice id, OR a Hume voice NAME (no `hume:` prefix)
  // ElevenLabs tuning
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  speed?: number;
  // Hume tuning
  description?: string;       // e.g. "warm, slightly hushed"
  provider?: 'HUME_AI' | 'CUSTOM_VOICE';
}

interface RequestBody {
  segments: Array<{ speakerId: string; text: string; tags?: string[] }>;
  speakerMap: Record<string, SpeakerVoiceCfg>;
  defaultEngine?: 'elevenlabs' | 'hume';
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 32768;
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

async function ttsElevenLabs(text: string, cfg: SpeakerVoiceCfg, apiKey: string) {
  const voiceId = cfg.voiceId || '9BWtsMINqrJLrRacOk9x';
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: cfg.modelId || 'eleven_multilingual_v2',
      voice_settings: {
        stability: cfg.stability ?? 0.5,
        similarity_boost: cfg.similarityBoost ?? 0.75,
        style: cfg.style ?? 0,
        use_speaker_boost: cfg.useSpeakerBoost ?? true,
        speed: cfg.speed ?? 1.0,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${err.slice(0, 200)}`);
  }
  const buf = await res.arrayBuffer();
  return { audioBase64: bufToBase64(buf), mime: 'audio/mpeg' };
}

async function ttsHume(text: string, cfg: SpeakerVoiceCfg, apiKey: string) {
  // Hume Octave TTS — /v0/tts/file returns audio bytes directly.
  // Docs: https://dev.hume.ai/reference/text-to-speech-tts/synthesize-file
  const body: any = {
    utterances: [
      {
        text,
        voice: { name: cfg.voiceId, provider: cfg.provider || 'HUME_AI' },
        ...(cfg.description ? { description: cfg.description } : {}),
        ...(typeof cfg.speed === 'number' ? { speed: cfg.speed } : {}),
      },
    ],
    format: { type: 'mp3' },
  };
  const res = await fetch('https://api.hume.ai/v0/tts/file', {
    method: 'POST',
    headers: {
      'X-Hume-Api-Key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Hume ${res.status}: ${err.slice(0, 300)}`);
  }
  const buf = await res.arrayBuffer();
  return { audioBase64: bufToBase64(buf), mime: 'audio/mpeg' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    const HUME_API_KEY = Deno.env.get('HUME_API_KEY');

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const auth = req.headers.get('Authorization');
    if (!auth) throw new Error('No authorization header');
    const { data: { user }, error: authErr } = await supa.auth.getUser(auth.replace('Bearer ', ''));
    if (authErr || !user) throw new Error('Unauthorized');

    const body = (await req.json()) as RequestBody;
    if (!Array.isArray(body.segments) || body.segments.length === 0) {
      throw new Error('segments[] is required');
    }
    if (!body.speakerMap || typeof body.speakerMap !== 'object') {
      throw new Error('speakerMap is required');
    }

    console.log('[multi-speaker-vo] segments:', body.segments.length, 'speakers:', Object.keys(body.speakerMap));

    // Resolve config per segment & generate sequentially to keep memory low
    // (segments are usually small — 3–20 lines).
    const out: Array<{
      speakerId: string;
      speakerName?: string;
      text: string;
      audioBase64: string;
      mime: string;
      engine: 'elevenlabs' | 'hume';
      voiceId: string;
    }> = [];

    for (const seg of body.segments) {
      const cfg = body.speakerMap[seg.speakerId];
      if (!cfg) {
        throw new Error(`No voice mapping for speaker "${seg.speakerId}"`);
      }
      const engine = cfg.engine || body.defaultEngine || 'elevenlabs';

      let result;
      if (engine === 'hume') {
        if (!HUME_API_KEY) throw new Error('HUME_API_KEY not configured');
        result = await ttsHume(seg.text, cfg, HUME_API_KEY);
      } else {
        if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not configured');
        result = await ttsElevenLabs(seg.text, cfg, ELEVENLABS_API_KEY);
      }

      out.push({
        speakerId: seg.speakerId,
        text: seg.text,
        audioBase64: result.audioBase64,
        mime: result.mime,
        engine,
        voiceId: cfg.voiceId,
      });
    }

    return new Response(JSON.stringify({ success: true, segments: out }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[multi-speaker-vo] error', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
