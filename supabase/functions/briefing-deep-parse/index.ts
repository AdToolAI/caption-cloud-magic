// supabase/functions/briefing-deep-parse/index.ts
//
// 2-pass deep parser. Pass A extracts a structured manifest from the raw
// briefing text. Pass B resolves @-mentions against the user's library,
// validates consistency, and produces a final ProductionPlan.
//
// No credits are deducted. NO writes to lipsync tables — only inserts into
// `composer_production_plans` for versioning.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

// ── Enums (mirror src/lib/.../manifestSchema.ts) ─────────────────────────────

const FRAMING = ['extreme-wide','wide','medium-wide','medium','medium-close-up','close-up','extreme-close-up'];
const ANGLE = ['eye-level','low-angle','high-angle','dutch-angle','over-the-shoulder','three-quarter','profile','frontal'];
const MOVEMENT = ['static','slow-push-in','push-in','pull-out','pan-left','pan-right','tilt-up','tilt-down','tracking','handheld','orbital','crane-up','crane-down','lean-in'];
const LIGHTING = ['natural','soft-window','hard-window','golden-hour','blue-hour','low-key','high-key','rim','backlit','practical','studio-softbox','neon','overcast'];
const ENGINE = ['auto','broll','heygen','sync-polish','cinematic-sync','sync-segments','native-dialogue'];

// ── Pass A — Structural extraction ───────────────────────────────────────────

const TOOL_PASS_A = {
  type: 'function',
  function: {
    name: 'emitBriefingManifest',
    description:
      'Extract a strict structured manifest from the briefing. Capture EVERY concrete value the briefing names: scene durations, voiceover lines with timecodes, ElevenLabs voice id/model/stability/similarity/style/speed/speaker_boost, caption style, highlight words, negative prompt, cast/location mentions (@…), shot framing/angle/movement/lighting per scene, anchor prompt hints (English). DO NOT invent. Leave optional fields undefined when not stated. If the briefing says "3 scenes × 5s = 15s" then emit exactly 3 scenes.',
    parameters: {
      type: 'object',
      properties: {
        project: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            aspectRatio: { type: 'string', enum: ['16:9','9:16','1:1','4:5'] },
            fps: { type: 'integer', enum: [24,25,30,60] },
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
              beat: { type: 'string', description: 'Pain | Reveal | Solution | CTA | Hook | …' },
              durationSec: { type: 'number' },
              engine: { type: 'string', enum: ENGINE },
              lipSync: { type: 'boolean' },
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
              brollHints: {
                type: 'array',
                description: 'Stock-footage keywords for B-Roll search (max 12, English).',
                items: { type: 'string' },
              },
              brandAnchor: {
                type: 'object',
                description: 'Brand-Kit anchors: logo endcard, color/font override, note.',
                properties: {
                  logoEndcard: { type: 'boolean' },
                  primaryColorOverride: { type: 'string' },
                  accentColorOverride: { type: 'string' },
                  fontOverride: { type: 'string' },
                  note: { type: 'string' },
                },
              },
              negativePromptScene: {
                type: 'string',
                description: 'Per-scene negative prompt, IN ADDITION to the global one.',
              },
              continuityHint: {
                type: 'string',
                description: 'Continuity hint, e.g. "same position as S01", "match wardrobe S02".',
              },
              musicCue: {
                type: 'object',
                properties: {
                  energy: { type: 'string', enum: ['low','mid','high','drop','silent'] },
                  marker: { type: 'string' },
                  note: { type: 'string' },
                },
              },
              dialogTurns: {
                type: 'array',
                description: 'Explicit dialog turns for cinematic-sync / native-dialogue scenes. Speaker mention keys keep the leading "@".',
                items: {
                  type: 'object',
                  properties: {
                    speakerMentionKey: { type: 'string' },
                    text: { type: 'string' },
                    mood: { type: 'string' },
                    delivery: { type: 'string' },
                  },
                  required: ['speakerMentionKey', 'text'],
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
            source: { type: 'string', enum: ['auto-from-vo','manual'] },
            font: { type: 'string' },
            sizePx: { type: 'integer' },
            color: { type: 'string' },
            strokeColor: { type: 'string' },
            strokePx: { type: 'integer' },
            highlightColor: { type: 'string' },
            maxWordsPerCue: { type: 'integer' },
            position: { type: 'string', enum: ['top','bottom','center'] },
            safeZonePct: { type: 'integer' },
            burnIn: { type: 'boolean' },
            highlightWords: { type: 'array', items: { type: 'string' } },
          },
        },
        negativePrompt: { type: 'string' },
      },
      required: ['scenes'],
    },
  },
};

const SYSTEM_PASS_A = `You are a professional ad director AND precision parser for video production briefings.

Your job: read the ENTIRE briefing and emit a strict manifest via the emitBriefingManifest tool.

═══════════════════════════════════════════════════════════════════════════
AUTO-DIRECTOR MODE (default — applies when the briefing does NOT enumerate scenes)
═══════════════════════════════════════════════════════════════════════════

If the briefing carries a "Mode: AUTO-DIRECTOR" hint OR simply does not list explicit
scenes ("Szene 1 …", "Scene 1 …", "3 scenes × 5s", etc.), you MUST act as a senior
commercial director and design a complete screenplay from the structured briefing
fields + the "## Cast" section.

Dramaturgy:
- Pick a rhythm that fits the tone/category. Default arc for ads:
  Hook → Pain → Reveal → Proof → CTA  (3–7 scenes total).
- For storytelling tone use Setup → Inciting → Conflict → Climax → Resolution.
- Distribute the project's "Total duration" evenly across scenes (round to 1s,
  min 3s, max 12s). When duration is missing, default to 5s per scene.

For EVERY auto-generated scene you MUST fill what the briefing does not specify:
- "voiceover.text": in the briefing's language, short, speakable, on-message.
  Derive from USPs / Logline / Target Audience. ≤ 25 words per scene.
- "cast": pick from the "## Cast" mention keys (e.g. "@founder-avatar"). Max 2
  speakers per scene. Pin to a single cast for talking-head moments; use 2 for
  dialog. If no cast is provided, leave empty (B-Roll only).
- "engine": "cinematic-sync" when the scene has cast + spoken VO/dialog;
  "broll" for pure cutaway / product hero / establishing shots; "heygen" only
  if the briefing explicitly asks for HeyGen photo-avatars.
- "lipSync": true whenever cast speaks on-camera.
- "shotDirector.{framing,angle,movement,lighting}": pick from the enums.
  Vary across scenes — never default everything to "medium / eye-level / static".
- "anchorPromptEN": 1–3 ENGLISH sentences describing the actual SCENE — setting,
  what is happening, props, environment, weather, time of day, mood. This is
  what the i2v model renders, so be CONCRETE and CINEMATIC.
  Examples: "Founder driving a vintage convertible along a coastal cliff road at
  golden hour, wind in hair, ocean glittering below." — "Engineer inside an
  airliner cockpit at dusk, hands on yoke, instrument panels glowing amber." —
  "Two soldiers crouched behind sandbags in a smoke-choked trench, debris
  falling, distant artillery flashes."
  HARD RULE — DIALOG SCENES: For any scene that contains spoken dialog or
  voiceover with on-camera cast (engine="cinematic-sync" or lipSync=true),
  the visible speaker MUST stay frontal or three-quarter with mouth and
  jaw unobstructed throughout the shot. NEVER write "hand on forehead",
  "hands over face", "looking down at laptop/phone/desk/screen", "head in
  hands", "head down", "eyes closed", "facing away", "back to camera",
  "from behind" or any similar face-occluding pose into a dialog scene's
  anchorPromptEN. Save those gestures for B-Roll / non-dialog scenes
  (engine="broll"). The lip-sync pipeline rejects plates where the
  speaker's face is not clearly visible.
- "performance.{mimik,gestik,blick,energy}": short free-form German/English
  hints for facial expression, gesture, gaze direction, energy level 1–5.
  Tailor to the beat (Hook = high energy, confident; Pain = concerned, low;
  CTA = warm-smile, to-camera, energy 4).
- "dialogTurns": only when multiple speakers actually exchange lines. One turn
  per line, "speakerMentionKey" = the @-mention from the cast list.
- "musicCue.energy": pick "low" | "mid" | "high" | "drop" | "silent" matching
  the beat.
- "brollHints": 3–6 short English Pexels/Pixabay keywords for optional cutaways.
- "beat": label like "Hook", "Pain", "Reveal", "Proof", "CTA".

DO NOT invent IDs. Only use @-mentions that appear in the "## Cast" section.
DO NOT invent voice IDs. Voice resolution is the resolver's job.

═══════════════════════════════════════════════════════════════════════════
LITERAL-PARSE MODE (applies when the briefing DOES list scenes explicitly)
═══════════════════════════════════════════════════════════════════════════

- If the briefing says "3 scenes × 5s = 15s" or lists "Szene 1 … Szene 3",
  emit EXACTLY that many scenes — never more, never fewer.
- Read tables, bullet lists, and prose as equally valid sources.
- Map shot framing/angle/movement/lighting to the provided enum values
  (closest match). Omit when no match.
- "Cinematic-Sync", "Sync-Polish", "HeyGen", "B-Roll", "Native Dialogue"
  engine names map to the engine enum verbatim (lowercased + hyphenated).
- Set lipSync=true when the scene explicitly uses a lip-sync engine
  (cinematic-sync, sync-polish, sync-segments, native-dialogue, heygen)
  or names a speaking on-camera character with VO.
- Voice IDs like "JBFqnCBsd6RMkjVDRZzb" go into voice.voiceId;
  names like "George" into voice.voiceName.
- Mentions keep the leading "@" verbatim — the resolver maps them to DB IDs.
- For VO timecodes prefer timecodeStartSec / timecodeEndSec in seconds.
- brandAnchor: extract logo-endcard mentions and scene-specific brand
  color/font overrides. Leave undefined when not mentioned.
- negativePromptScene: only when the briefing names a per-scene negative
  prompt; otherwise leave undefined and rely on the global negativePrompt.
- continuityHint: phrases like "gleiche Position wie S01", "match wardrobe S02".
- dialogTurns: for cinematic-sync / native-dialogue / sync-* / heygen scenes
  with multiple lines, emit one turn per speaker line. Detect speakers from
  "NAME:", "[NAME]:", "NAME — MOOD:" or labelled bullets.

In LITERAL mode, DO NOT invent fields the briefing does not state.`;

// ── Pass B — Resolution & validation ─────────────────────────────────────────

const TOOL_PASS_B = {
  type: 'function',
  function: {
    name: 'emitProductionPlan',
    description:
      'Take a parsed manifest plus the user library and emit a final ProductionPlan with resolved cast/location IDs, voice IDs per character, and a list of unresolved issues with concrete suggestions.',
    parameters: {
      type: 'object',
      properties: {
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              index: { type: 'integer' },
              cast: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    mentionKey: { type: 'string' },
                    characterId: { type: 'string', nullable: true },
                    characterName: { type: 'string' },
                    voiceId: { type: 'string', nullable: true },
                    voiceName: { type: 'string' },
                    outfit: { type: 'string' },
                  },
                  required: ['mentionKey', 'characterName'],
                },
              },
              location: {
                type: 'object',
                properties: {
                  mentionKey: { type: 'string' },
                  locationId: { type: 'string', nullable: true },
                  locationName: { type: 'string' },
                },
                required: ['mentionKey', 'locationName'],
              },
            },
            required: ['index'],
          },
        },
        voice: {
          type: 'object',
          properties: {
            voiceId: { type: 'string' },
            voiceName: { type: 'string' },
          },
        },
        unresolved: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              reason: { type: 'string' },
              suggestion: { type: 'string' },
              severity: { type: 'string', enum: ['info','warn','error'] },
            },
            required: ['field', 'reason'],
          },
        },
      },
      required: ['scenes', 'unresolved'],
    },
  },
};

const SYSTEM_PASS_B = `You validate and resolve a parsed briefing manifest against the user's actual asset library.

You receive:
- MANIFEST: the structural extraction from pass A
- LIBRARY.characters: brand_characters available to the user (id, name, default_voice_id)
- LIBRARY.locations: brand_locations available to the user (id, name)
- LIBRARY.voices: ElevenLabs voices known to the system (id, name, language)

Resolve every cast mention (@founder-avatar etc.) and every location mention (@home-office etc.) to a library entry. Normalize: strip "@", lowercase, remove separators (- _ space), allow substring match in either direction. When unresolved, set characterId/locationId = null and add an unresolved item with severity=warn and a clear suggestion like "Avatar 'Founder Default' im Library nicht gefunden — manuell zuordnen".

For voice resolution:
- If the briefing names a voice (id OR name), resolve to LIBRARY.voices and copy voiceId/voiceName to the project-level voice settings.
- For each cast member, copy default_voice_id from the matched brand_character into ResolvedCast.voiceId, or null if missing.

Consistency checks (each becomes an unresolved entry when violated):
- Sum of scene durationSec must equal project.totalDurationSec (severity=warn).
- Every cinematic-sync / heygen / sync-* / native-dialogue scene MUST have at least one cast member (severity=error if none).
- VO timecodes within a scene must fit inside its durationSec (severity=warn).

DO NOT invent IDs. Only emit characterId / locationId that exist in LIBRARY. If you are unsure, set null and add an unresolved entry.`;

interface CallOpts { model: string; system: string; tool: any; user: string; }

async function callGateway(opts: CallOpts) {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      tools: [opts.tool],
      tool_choice: { type: 'function', function: { name: opts.tool.function.name } },
      max_tokens: 12000,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(`gateway ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  const call = json?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error('no tool call returned');
  return JSON.parse(call.function.arguments);
}

function normalizeMention(s: string): string {
  return String(s ?? '').replace(/^@/, '').toLowerCase().replace(/[-_\s]/g, '');
}

const ENGINE_ALIASES: Record<string, string> = {
  'ai-heygen': 'heygen',
  'heygen-avatar': 'heygen',
  'b-roll': 'broll',
  'b_roll': 'broll',
  'broll-stock': 'broll',
  'sync': 'sync-polish',
  'syncso': 'sync-polish',
  'sync-so': 'sync-polish',
  'sync.so': 'sync-polish',
  'lipsync': 'sync-polish',
  'lip-sync': 'sync-polish',
  'cinematic': 'cinematic-sync',
  'native': 'native-dialogue',
  'dialogue': 'native-dialogue',
  'segments': 'sync-segments',
};
const ENGINE_WHITELIST = new Set(['auto','broll','heygen','sync-polish','cinematic-sync','sync-segments','native-dialogue']);
const MUSIC_ENERGY_WHITELIST = new Set(['low','mid','high','drop','silent']);

function normalizeEngine(raw: any): string {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'auto';
  if (ENGINE_WHITELIST.has(s)) return s;
  if (ENGINE_ALIASES[s]) return ENGINE_ALIASES[s];
  return 'auto';
}
function clamp(n: any, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}
function stripUndef<T extends Record<string, any>>(o: T): T {
  for (const k of Object.keys(o)) {
    if (o[k] === undefined) delete o[k];
  }
  return o;
}

function mergeManifestAndResolution(manifest: any, resolution: any) {
  const scenesById = new Map<number, any>();
  for (const s of resolution?.scenes ?? []) {
    if (typeof s?.index === 'number') scenesById.set(s.index, s);
  }
  const scenes = (manifest?.scenes ?? []).map((s: any, i: number) => {
    const r = scenesById.get(s.index);
    const cast = (s.cast ?? []).map((c: any) => {
      // Fuzzy match by normalized mentionKey (Pass B may return slightly different formatting).
      const needle = normalizeMention(c.mentionKey);
      const rCast =
        (r?.cast ?? []).find((x: any) => x.mentionKey === c.mentionKey) ||
        (r?.cast ?? []).find((x: any) => normalizeMention(x.mentionKey) === needle);
      return stripUndef({
        mentionKey: c.mentionKey,
        outfit: c.outfit ?? rCast?.outfit,
        characterId: typeof rCast?.characterId === 'string' ? rCast.characterId : null,
        characterName: rCast?.characterName ?? String(c.mentionKey ?? '').replace(/^@/, ''),
        voiceId: typeof rCast?.voiceId === 'string' ? rCast.voiceId : null,
        voiceName: rCast?.voiceName,
        referenceImageUrl: null,
      });
    });
    const location = s.location ? (() => {
      const r2 = r?.location;
      return stripUndef({
        mentionKey: s.location.mentionKey,
        locationId: typeof r2?.locationId === 'string' ? r2.locationId : null,
        locationName: r2?.locationName ?? String(s.location.mentionKey ?? '').replace(/^@/, ''),
      });
    })() : undefined;


    const engine = normalizeEngine(s.engine);
    const durationSec = clamp(s.durationSec, 1, 60, 5);

    // musicCue normalization
    let musicCue: any = undefined;
    if (s.musicCue && typeof s.musicCue === 'object') {
      const energyRaw = String(s.musicCue.energy ?? '').toLowerCase();
      const mc = stripUndef({
        energy: MUSIC_ENERGY_WHITELIST.has(energyRaw) ? energyRaw : undefined,
        marker: s.musicCue.marker ? String(s.musicCue.marker).slice(0, 80) : undefined,
        note: s.musicCue.note ? String(s.musicCue.note).slice(0, 240) : undefined,
      });
      if (Object.keys(mc).length) musicCue = mc;
    }

    // dialogTurns sanitize
    let dialogTurns: any = undefined;
    if (Array.isArray(s.dialogTurns)) {
      const turns = s.dialogTurns
        .map((t: any) => stripUndef({
          speakerMentionKey: String(t?.speakerMentionKey ?? '').slice(0, 80).trim(),
          text: String(t?.text ?? '').slice(0, 1000).trim(),
          mood: t?.mood ? String(t.mood).slice(0, 80) : undefined,
          delivery: t?.delivery ? String(t.delivery).slice(0, 240) : undefined,
        }))
        .filter((t: any) => t.speakerMentionKey && t.text)
        .slice(0, 20);
      if (turns.length) dialogTurns = turns;
    }

    // brollHints sanitize
    let brollHints: any = undefined;
    if (Array.isArray(s.brollHints)) {
      const hints = s.brollHints
        .map((h: any) => String(h ?? '').trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 12);
      if (hints.length) brollHints = hints;
    }

    // performance.energy clamp
    let performance: any = undefined;
    if (s.performance && typeof s.performance === 'object') {
      const p = stripUndef({
        mimik: s.performance.mimik,
        gestik: s.performance.gestik,
        blick: s.performance.blick,
        energy: s.performance.energy != null
          ? clamp(s.performance.energy, 1, 5, 3)
          : undefined,
      });
      if (Object.keys(p).length) performance = p;
    }

    return stripUndef({
      index: Number.isFinite(Number(s.index)) ? Math.max(1, Math.floor(Number(s.index))) : i + 1,
      label: s.label,
      beat: s.beat,
      durationSec,
      engine,
      lipSync: s.lipSync === true
        || ['cinematic-sync','sync-polish','sync-segments','native-dialogue','heygen'].includes(engine),
      voiceover: s.voiceover,
      cast,
      location,
      shotDirector: s.shotDirector,
      anchorPromptEN: s.anchorPromptEN,
      performance,
      brollHints,
      brandAnchor: s.brandAnchor,
      negativePromptScene: s.negativePromptScene,
      continuityHint: s.continuityHint,
      musicCue,
      dialogTurns,
    });
  });

  console.log('[briefing-deep-parse] merge done — scenes:', scenes.length, 'unresolved:', (resolution?.unresolved ?? []).length);

  return {
    project: manifest?.project,
    scenes,
    voice: {
      ...(manifest?.voice ?? {}),
      voiceId: resolution?.voice?.voiceId ?? manifest?.voice?.voiceId,
      voiceName: resolution?.voice?.voiceName ?? manifest?.voice?.voiceName,
      provider: 'elevenlabs',
      requestStitching: manifest?.voice?.requestStitching ?? true,
    },
    captions: manifest?.captions,
    negativePrompt: manifest?.negativePrompt,
    unresolved: resolution?.unresolved ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
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
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const briefing: string = String(body?.briefing ?? '').trim();
    const projectId: string | null = body?.projectId ?? null;
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

    const t0 = Date.now();

    // ── Pass A — structural extraction (Gemini 2.5 Pro for quality) ───────
    const manifest = await callGateway({
      model: 'google/gemini-2.5-pro',
      system: SYSTEM_PASS_A,
      tool: TOOL_PASS_A,
      user: `BRIEFING:\n\n${briefing}`,
    });
    const tA = Date.now();

    // ── Safety net: if Pass A returned 0 scenes (modelblip / extreme thin
    //    briefing), synthesize a deterministic 3-scene arc so the user is
    //    never stuck on an empty Production Plan.
    if (!Array.isArray(manifest?.scenes) || manifest.scenes.length === 0) {
      console.warn('[briefing-deep-parse] Pass A returned 0 scenes — synthesizing fallback arc');
      const total = Number(manifest?.project?.totalDurationSec) || 15;
      const per = Math.max(3, Math.min(12, Math.round(total / 3)));
      // First @-mention in the briefing text, if any.
      const mentionMatch = briefing.match(/@[a-z0-9][a-z0-9-_]{1,47}/i);
      const firstMention = mentionMatch ? mentionMatch[0] : null;
      const castOne = firstMention ? [{ mentionKey: firstMention }] : [];
      const engine = firstMention ? 'cinematic-sync' : 'broll';
      const beats = [
        { beat: 'Hook',   framing: 'medium-close-up', movement: 'slow-push-in', energy: 'high' },
        { beat: 'Reveal', framing: 'wide',            movement: 'tracking',     energy: 'mid'  },
        { beat: 'CTA',    framing: 'medium',          movement: 'static',       energy: 'high' },
      ];
      manifest.scenes = beats.map((b, i) => ({
        index: i + 1,
        label: b.beat,
        beat: b.beat,
        durationSec: per,
        engine,
        lipSync: !!firstMention,
        cast: castOne,
        shotDirector: {
          framing: b.framing,
          angle: 'eye-level',
          movement: b.movement,
          lighting: 'soft-window',
        },
        anchorPromptEN: `${b.beat} beat for ${manifest?.project?.name ?? 'the brand'}: cinematic establishing shot in a relevant setting.`,
        performance: {
          mimik: b.beat === 'Hook' ? 'confident' : b.beat === 'CTA' ? 'warm-smile' : 'curious',
          gestik: b.beat === 'CTA' ? 'open-palms' : 'still',
          blick: b.beat === 'CTA' ? 'to-camera' : 'away',
          energy: b.energy === 'high' ? 4 : 3,
        },
        musicCue: { energy: b.energy },
      }));
      if (!manifest.project) manifest.project = {};
      if (!manifest.project.totalDurationSec) manifest.project.totalDurationSec = per * 3;
    }


    // ── Library snapshot (small, no PII) ──────────────────────────────────
    const [charRes, locRes] = await Promise.all([
      supabase
        .from('brand_characters')
        .select('id,name,default_voice_id')
        .eq('user_id', userId)
        .limit(200),
      supabase
        .from('brand_locations')
        .select('id,name')
        .eq('user_id', userId)
        .limit(200),
    ]);
    const characters = charRes.data ?? [];
    const locations = locRes.data ?? [];

    // Curated voice list (mirror of src/lib/elevenlabs-voices catalog).
    const voices = [
      { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', language: 'multilingual' },
      { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', language: 'multilingual' },
      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', language: 'multilingual' },
      { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', language: 'multilingual' },
      { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', language: 'multilingual' },
      { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', language: 'multilingual' },
      { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', language: 'multilingual' },
      { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', language: 'multilingual' },
      { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', language: 'multilingual' },
      { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', language: 'multilingual' },
      { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', language: 'multilingual' },
      { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', language: 'multilingual' },
      { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', language: 'multilingual' },
      { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', language: 'multilingual' },
    ];

    // ── Pass B — resolution + validation ──────────────────────────────────
    let resolution: any = { scenes: [], unresolved: [] };
    try {
      resolution = await callGateway({
        model: 'google/gemini-2.5-pro',
        system: SYSTEM_PASS_B,
        tool: TOOL_PASS_B,
        user: JSON.stringify({
          MANIFEST: manifest,
          LIBRARY: { characters, locations, voices },
        }),
      });
    } catch (e: any) {
      console.warn('[briefing-deep-parse] Pass B failed, falling back to local resolution:', e?.message);
      // Local fallback resolution
      const resolvedScenes = (manifest?.scenes ?? []).map((s: any) => {
        const cast = (s.cast ?? []).map((c: any) => {
          const needle = normalizeMention(c.mentionKey);
          const hit = characters.find((ch: any) => {
            const n = normalizeMention(ch.name);
            return n.includes(needle) || needle.includes(n);
          });
          return {
            mentionKey: c.mentionKey,
            characterId: hit?.id ?? null,
            characterName: hit?.name ?? c.mentionKey.replace(/^@/, ''),
            voiceId: hit?.default_voice_id ?? null,
            outfit: c.outfit,
          };
        });
        let location;
        if (s.location?.mentionKey) {
          const needle = normalizeMention(s.location.mentionKey);
          const hit = locations.find((l: any) => {
            const n = normalizeMention(l.name);
            return n.includes(needle) || needle.includes(n);
          });
          location = {
            mentionKey: s.location.mentionKey,
            locationId: hit?.id ?? null,
            locationName: hit?.name ?? s.location.mentionKey.replace(/^@/, ''),
          };
        }
        return { index: s.index, cast, location };
      });
      resolution = { scenes: resolvedScenes, unresolved: [] };
    }
    const tB = Date.now();

    const plan = mergeManifestAndResolution(manifest, resolution);

    // Local fill-pass: for any cast member with characterId === null, run a
    // last-resort fuzzy match against the loaded `characters` library and
    // back-fill characterId + characterName + voiceId (default_voice_id).
    // Voice fallback: if still null, inherit project-level voice.
    try {
      const projectVoiceId: string | null =
        (plan?.voice?.voiceId as string | undefined) ?? null;
      for (const sc of plan.scenes ?? []) {
        for (const c of sc.cast ?? []) {
          if (!c.characterId) {
            const needle = normalizeMention(c.mentionKey ?? c.characterName ?? '');
            const hit = characters.find((ch: any) => {
              const n = normalizeMention(ch.name);
              return n && needle && (n.includes(needle) || needle.includes(n));
            });
            if (hit) {
              c.characterId = hit.id;
              c.characterName = hit.name;
              if (!c.voiceId && typeof hit.default_voice_id === 'string') {
                c.voiceId = hit.default_voice_id;
              }
            }
          }
          if (!c.voiceId && projectVoiceId) c.voiceId = projectVoiceId;
        }
      }
    } catch (e: any) {
      console.warn('[briefing-deep-parse] local fill-pass failed (non-fatal):', e?.message);
    }

    try {
      console.log('[briefing-deep-parse] plan summary', {
        scenes: plan.scenes?.length ?? 0,
        unresolved: plan.unresolved?.length ?? 0,
        perScene: (plan.scenes ?? []).map((sc: any) => ({
          index: sc.index,
          cast: sc.cast?.length ?? 0,
          hasLocation: !!sc.location,
          engine: sc.engine,
          durationSec: sc.durationSec,
        })),
      });
    } catch (_) { /* noop */ }

    // ── Persist (versioned) ───────────────────────────────────────────────
    let version = 1;
    try {
      if (projectId) {
        const { data: prev } = await supabase
          .from('composer_production_plans')
          .select('version')
          .eq('project_id', projectId)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prev?.version) version = (prev.version as number) + 1;
      }
      await supabase.from('composer_production_plans').insert({
        user_id: userId,
        project_id: projectId,
        version,
        source_text: briefing,
        manifest: plan,
        unresolved: plan.unresolved,
        parser_meta: {
          passA_ms: tA - t0,
          passB_ms: tB - tA,
          total_ms: Date.now() - t0,
          model: 'gemini-2.5-pro',
        },
      });
    } catch (e: any) {
      console.warn('[briefing-deep-parse] persist failed (non-fatal):', e?.message);
    }

    return new Response(JSON.stringify({ plan, version, timings: { passA_ms: tA - t0, passB_ms: tB - tA } }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    const status = e?.status === 429 ? 429 : e?.status === 402 ? 402 : 500;
    console.error('[briefing-deep-parse] error:', e?.message);
    return new Response(JSON.stringify({ error: e?.message ?? 'deep parse failed' }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
