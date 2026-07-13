// supabase/functions/generate-multi-speaker-vo/index.ts
// Generates per-segment TTS audio for a multi-speaker script.
// Voice Studio 2.0:
//   - Inline tags ([whisper], [excited], [soft], [emphasize], [laugh], [pause 0.5s])
//     are translated to engine-specific cues (ElevenLabs voice settings + SSML
//     <break/>; Hume "description" parameter + punctuation pauses).
//   - Optional `overrides` per segment merge on top of the speaker default.
// Returns: { segments:[{speakerId,text,audioBase64,mime,engine,voiceId}] }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.75.0';

import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

interface SpeakerVoiceCfg {
  engine: 'elevenlabs' | 'hume';
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  speed?: number;
  description?: string;
  provider?: 'HUME_AI' | 'CUSTOM_VOICE';
}

interface RequestSegment {
  speakerId: string;
  text: string;
  tags?: string[];
  /** Per-segment override that wins over the speaker default. */
  overrides?: { stability?: number; style?: number; speed?: number };
}

interface RequestBody {
  segments: RequestSegment[];
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

// ─── Tag translation helpers ──────────────────────────────────────
const TAG_TO_DESCRIPTION: Record<string, string> = {
  whisper: 'in a soft, hushed whisper',
  soft: 'in a calm, soft tone',
  excited: 'with energetic, excited delivery',
  emphasize: 'with strong, emphatic stress',
  laugh: 'with a warm, audible laugh',
  sad: 'in a sad, somber tone',
  angry: 'in an angry, intense tone',
  shout: 'shouting loudly',
};

function buildHumeDescription(tags: string[] | undefined, base: string | undefined): string | undefined {
  const cues = (tags || []).map((t) => TAG_TO_DESCRIPTION[t.toLowerCase()]).filter(Boolean);
  if (!cues.length && !base) return undefined;
  return [base, ...cues].filter(Boolean).join('. ');
}

function applyTagsToElevenLabsSettings(tags: string[] | undefined, cfg: SpeakerVoiceCfg): SpeakerVoiceCfg {
  if (!tags?.length) return cfg;
  const out = { ...cfg };
  for (const raw of tags) {
    const t = raw.toLowerCase();
    if (t === 'whisper' || t === 'soft') {
      out.stability = Math.max(out.stability ?? 0.5, 0.8);
      out.style = Math.min(out.style ?? 0, 0.15);
    } else if (t === 'excited' || t === 'shout') {
      out.stability = Math.min(out.stability ?? 0.5, 0.35);
      out.style = Math.max(out.style ?? 0, 0.75);
    } else if (t === 'emphasize') {
      out.style = Math.max(out.style ?? 0, 0.55);
    } else if (t === 'sad' || t === 'angry') {
      out.stability = Math.min(out.stability ?? 0.5, 0.4);
      out.style = Math.max(out.style ?? 0, 0.6);
    }
  }
  return out;
}

/** Replace `[pause N s]` cues with engine-specific breaks. Stripped from text otherwise. */
function expandPauseCues(text: string, engine: 'elevenlabs' | 'hume'): string {
  const PAUSE_RE = /\[pause(?:\s+([0-9]*\.?[0-9]+)\s*s)?\]/gi;
  return text.replace(PAUSE_RE, (_, secs) => {
    const s = Math.max(0.1, Math.min(3, Number(secs) || 0.5));
    if (engine === 'elevenlabs') {
      return `<break time="${s.toFixed(2)}s"/>`;
    }
    // Hume Octave honors punctuation pauses; longer pause = more dots.
    const dots = Math.max(2, Math.round(s * 3));
    return ' ' + '.'.repeat(dots) + ' ';
  }).replace(/\s+/g, ' ').trim();
}

// ─── TTS engines ──────────────────────────────────────────────────
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
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "audio" });
  }
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

    const out: Array<{
      speakerId: string;
      text: string;
      audioBase64: string;
      mime: string;
      engine: 'elevenlabs' | 'hume';
      voiceId: string;
    }> = [];

    for (const seg of body.segments) {
      const baseCfg = body.speakerMap[seg.speakerId];
      if (!baseCfg) throw new Error(`No voice mapping for speaker "${seg.speakerId}"`);
      const engine = baseCfg.engine || body.defaultEngine || 'elevenlabs';

      // Merge per-segment overrides on top of speaker defaults.
      const mergedCfg: SpeakerVoiceCfg = {
        ...baseCfg,
        ...(seg.overrides?.stability !== undefined ? { stability: seg.overrides.stability } : {}),
        ...(seg.overrides?.style !== undefined ? { style: seg.overrides.style } : {}),
        ...(seg.overrides?.speed !== undefined ? { speed: seg.overrides.speed } : {}),
      };

      // Tag-aware text expansion + tone tuning.
      const expandedText = expandPauseCues(seg.text || '', engine);

      let result;
      if (engine === 'hume') {
        if (!HUME_API_KEY) throw new Error('HUME_API_KEY not configured');
        const description = buildHumeDescription(seg.tags, mergedCfg.description);
        result = await ttsHume(expandedText, { ...mergedCfg, description }, HUME_API_KEY);
      } else {
        if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not configured');
        const tuned = applyTagsToElevenLabsSettings(seg.tags, mergedCfg);
        result = await ttsElevenLabs(expandedText, tuned, ELEVENLABS_API_KEY);
      }

      out.push({
        speakerId: seg.speakerId,
        text: seg.text,
        audioBase64: result.audioBase64,
        mime: result.mime,
        engine,
        voiceId: mergedCfg.voiceId,
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
