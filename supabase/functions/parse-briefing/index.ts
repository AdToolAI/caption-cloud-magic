// supabase/functions/parse-briefing/index.ts
//
// Stage 1 of the Briefing → Storyboard pipeline.
//
// Accepts a long-form briefing (markdown, tables, freeform — up to ~30k tokens
// of text) and uses Gemini 2.5 Flash with tool-calling to extract a strictly
// typed BriefingManifest. The manifest is then rendered by BriefingApplySheet
// on the client; only after the user confirms is anything written into the
// composer project.
//
// Costs ~Lovable-AI Flash tokens; NO credits are deducted here.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

// ── Tool-calling schema (kept narrow, mirrors src/lib/.../manifestSchema.ts) ──

const FRAMING = ['extreme-wide', 'wide', 'medium-wide', 'medium', 'medium-close-up', 'close-up', 'extreme-close-up'];
const ANGLE = ['eye-level', 'low-angle', 'high-angle', 'dutch-angle', 'over-the-shoulder', 'three-quarter', 'profile', 'frontal'];
const MOVEMENT = ['static', 'slow-push-in', 'push-in', 'pull-out', 'pan-left', 'pan-right', 'tilt-up', 'tilt-down', 'tracking', 'handheld', 'orbital', 'crane-up', 'crane-down', 'lean-in'];
const LIGHTING = ['natural', 'soft-window', 'hard-window', 'golden-hour', 'blue-hour', 'low-key', 'high-key', 'rim', 'backlit', 'practical', 'studio-softbox', 'neon', 'overcast'];
const ENGINE = ['auto', 'broll', 'heygen', 'sync-polish', 'cinematic-sync', 'sync-segments', 'native-dialogue'];

const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'emitBriefingManifest',
    description:
      'Extract a structured production manifest from the briefing. Map every concrete value the briefing states (durations, voiceover lines, voice IDs, shot framing, captions, negative prompt, cast/location mentions). Leave fields undefined when the briefing does not specify them — do not invent.',
    parameters: {
      type: 'object',
      properties: {
        project: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:5'] },
            fps: { type: 'integer', enum: [24, 25, 30, 60] },
            totalDurationSec: { type: 'number' },
            platforms: { type: 'array', items: { type: 'string' } },
          },
        },
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              index: { type: 'integer' },
              label: { type: 'string' },
              durationSec: { type: 'number' },
              engine: { type: 'string', enum: ENGINE },
              voiceover: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  timecodeStartSec: { type: 'number' },
                  timecodeEndSec: { type: 'number' },
                  delivery: { type: 'string' },
                  speedMultiplier: { type: 'number' },
                },
              },
              cast: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    mentionKey: { type: 'string' },
                    outfit: { type: 'string' },
                  },
                  required: ['mentionKey'],
                },
              },
              location: {
                type: 'object',
                properties: { mentionKey: { type: 'string' } },
                required: ['mentionKey'],
              },
              shotDirector: {
                type: 'object',
                properties: {
                  framing: { type: 'string', enum: FRAMING },
                  angle: { type: 'string', enum: ANGLE },
                  movement: { type: 'string', enum: MOVEMENT },
                  lighting: { type: 'string', enum: LIGHTING },
                  stylePreset: { type: 'string' },
                },
              },
              anchorPromptEN: { type: 'string' },
              performance: {
                type: 'object',
                properties: {
                  mimik: { type: 'string' },
                  gestik: { type: 'string' },
                  blick: { type: 'string' },
                  energy: { type: 'integer' },
                },
              },
            },
            required: ['index', 'durationSec'],
          },
        },
        voice: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['elevenlabs'] },
            voiceId: { type: 'string' },
            voiceName: { type: 'string' },
            model: { type: 'string' },
            stability: { type: 'number' },
            similarityBoost: { type: 'number' },
            style: { type: 'number' },
            speakerBoost: { type: 'boolean' },
            speed: { type: 'number' },
            requestStitching: { type: 'boolean' },
          },
        },
        captions: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            source: { type: 'string', enum: ['auto-from-vo', 'manual'] },
            font: { type: 'string' },
            sizePx: { type: 'integer' },
            color: { type: 'string' },
            strokeColor: { type: 'string' },
            strokePx: { type: 'integer' },
            highlightColor: { type: 'string' },
            maxWordsPerCue: { type: 'integer' },
            position: { type: 'string', enum: ['top', 'bottom', 'center'] },
            safeZonePct: { type: 'integer' },
            burnIn: { type: 'boolean' },
            highlightWords: { type: 'array', items: { type: 'string' } },
          },
        },
        negativePrompt: { type: 'string' },
        unresolved: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              reason: { type: 'string' },
              suggestion: { type: 'string' },
            },
            required: ['field', 'reason'],
          },
        },
      },
      required: ['scenes'],
    },
  },
};

const SYSTEM_PROMPT = `You convert long-form video production briefings into a strict BriefingManifest via tool-calling.

Rules:
- Read the ENTIRE briefing. Tables, bullet lists and prose are all valid sources.
- Extract every concrete value the briefing names: scene durations, voiceover lines with timecodes, ElevenLabs voice ID/model/stability/similarity/style/speed/speaker_boost, caption style (font, size, color, stroke, highlight color, safe-zone, max-words-per-cue), highlighted keywords, negative prompt, cast mentions (e.g. "@founder-avatar"), location mentions (e.g. "@home-office"), shot framing/angle/movement/lighting per scene, style presets, and anchor prompt hints (keep these in English).
- DO NOT invent fields the briefing does not state. Leave optional fields undefined.
- Map shot framing/angle/movement/lighting to the provided enum values (closest match). If no match exists, omit the field and add an entry to "unresolved".
- For VO timecodes, prefer "timecodeStartSec"/"timecodeEndSec" in seconds.
- For mentions like "@founder-avatar", keep the leading "@" verbatim — the resolver maps them to DB IDs.
- If the briefing references a voice by name only (e.g. "George"), set voice.voiceName and leave voiceId for the resolver.
- Anything ambiguous → add to "unresolved" with field path and a short reason.`;

async function callGateway(briefing: string, model: string) {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `BRIEFING:\n\n${briefing}` },
      ],
      tools: [TOOL_DEFINITION],
      tool_choice: { type: 'function', function: { name: 'emitBriefingManifest' } },
      max_tokens: 8000,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(`gateway ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  const call = json?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error('no tool call returned');
  return JSON.parse(call.function.arguments);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth (verify_jwt is on by default for new functions in this project, but
    // we still grab the user so we can scope future cache rows by user_id).
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const briefing: string = String(body?.briefing ?? '').trim();
    if (!briefing) {
      return new Response(JSON.stringify({ error: 'briefing text required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (briefing.length > 120_000) {
      return new Response(JSON.stringify({ error: 'briefing too long (max ~120k chars)' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try Gemini 2.5 Flash first (1M context, cheap). Fall back to Pro on
    // structured-output failure (very long / dense briefings).
    let manifest: any;
    try {
      manifest = await callGateway(briefing, 'google/gemini-2.5-flash');
    } catch (e: any) {
      if (e?.status === 429 || e?.status === 402) throw e;
      console.warn('[parse-briefing] flash failed, retrying with pro:', e?.message);
      manifest = await callGateway(briefing, 'google/gemini-2.5-pro');
    }

    return new Response(JSON.stringify({ manifest }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    const status = e?.status === 429 ? 429 : e?.status === 402 ? 402 : 500;
    console.error('[parse-briefing] error:', e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? 'parse failed' }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
