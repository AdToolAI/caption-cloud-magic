// supabase/functions/briefing-deep-parse/index.ts
//
// 2-pass deep parser. Pass A extracts a structured manifest from the raw
// briefing text. Pass B resolves @-mentions against the user's library,
// validates consistency, and produces a final ProductionPlan.
//
// No credits are deducted. NO writes to lipsync tables — only inserts into
// `composer_production_plans` for versioning.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
import { resolveCatalogId, CATALOG_VERSION, type CatalogAxis } from "./catalog.ts";
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
                    shotType: { type: 'string', enum: ['full','profile','back','detail','pov','silhouette'], description: 'Per-cast framing override for two-shot scenes. Omit when the scene-level framing applies to every speaker.' },
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
              transition: {
                type: 'object',
                description: 'Transition INTO this scene. Only set when the briefing explicitly names one (e.g. "Übergang: crossfade", "hard cut"). Defaults are applied client-side.',
                properties: {
                  type: { type: 'string', enum: ['none','fade','crossfade','wipe','slide','zoom'] },
                  durationSec: { type: 'number' },
                },
              },
              textOverlay: {
                type: 'object',
                description: 'Burnt-in scene caption (kinetic text). Set only when the briefing requests on-screen text for this scene.',
                properties: {
                  text: { type: 'string' },
                  position: { type: 'string', enum: ['top','center','bottom'] },
                  animation: { type: 'string', enum: ['none','fade-in','scale-bounce','slide-left','slide-right','word-by-word','glow-pulse'] },
                  fontSizePx: { type: 'integer' },
                  color: { type: 'string' },
                },
                required: ['text'],
              },
              tone: { type: 'string', description: 'Scene-level tone keyword (e.g. "cinematic", "luxury", "documentary"). Optional override of the project tone.' },
              seed: { type: 'integer', description: 'Master seed for reproducible renders. Only set when the briefing names a number ("Seed: 12345").' },
              _meta: {
                type: 'object',
                description: 'AI-enrichment trail for this scene. List the dotted field paths you filled in because the briefing did NOT explicitly state them (e.g. "shotDirector.lighting", "performance.gestik", "anchorPromptEN"). The UI shows a ✨ badge next to these so the creator sees what is theirs vs. AI-added.',
                properties: {
                  aiFilled: { type: 'array', items: { type: 'string' } },
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
        _meta: {
          type: 'object',
          description: 'Briefing-Intelligence v2 telemetry. Set `mode` to one of storytelling | brand | product | educational | other (best guess based on the briefing). Set `modeConfidence` 0..1. Use `research` as a short array of factual bullets you leaned on to enrich the plan (general knowledge; do NOT fabricate sources). Use `aiFilled` to list plan-level dotted paths you invented (e.g. "captions.font", "voice.voiceName") because the briefing did not state them.',
          properties: {
            mode: { type: 'string' },
            modeConfidence: { type: 'number' },
            research: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  fact: { type: 'string' },
                  source: { type: 'string' },
                },
                required: ['fact'],
              },
            },
            aiFilled: { type: 'array', items: { type: 'string' } },
          },
        },
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
- "cast": pick from the "## Cast" mention keys (e.g. "@founder-avatar"). For
  ordinary talking-head moments use 1 speaker; for dialog use 2 speakers; for
  REQUIRED ensemble moments use ALL selected cast members up to 4. If no cast is
  provided, leave empty (B-Roll only).
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

ENSEMBLE CAST GUARANTEE (HARD): If the "## Cast" section contains 2–4 selected
avatars, at least ONE scene MUST include ALL selected cast mention keys together.
If the plan has 6 or more scenes, at least TWO scenes MUST include ALL selected
cast mention keys together. These scenes must be wide/medium-wide group shots,
not close-ups, and anchorPromptEN must name every cast member and describe a
distinct visible action for each.

INTELLIGENT DEFAULTS — Transition / Overlay / Tone / Performance (NEVER leave undefined):
You MUST always fill scenes[i].transition, scenes[i].textOverlay (or leave
empty when no overlay belongs there), scenes[i].tone, AND scenes[i].performance
— using the following heuristics — and list each inferred path in
scenes[i]._meta.aiFilled (e.g. "transition.type", "textOverlay.text",
"tone", "performance.mimik", "performance.gestik", "performance.blick",
"performance.energy"):

  • transition.type & durationSec (use the beat of THIS scene):
      Hook / Cold-Open / Pain           → "cut",        0.0
      Reveal / Twist / Proof            → "crossfade",  0.5
      CTA / Endcard / Outro             → "fade",       0.6
      anything else                     → "crossfade",  0.4
      First scene (index=1) ALWAYS gets "fade" 0.6 (intro from black).

  • textOverlay (only set "text" when an overlay actually belongs):
      CTA scene  → text = brand cta line if present, else "Jetzt testen",
                   position="bottom", animation="scale-bounce".
      Hook scene → text = first 3–5 words of voiceover.text in ALL CAPS
                   when the briefing already pushes a punchy claim,
                   position="top", animation="fade-in".
                   If voiceover is conversational or longer than 8 words,
                   leave textOverlay UNDEFINED instead of forcing one.
      Otherwise  → leave textOverlay UNDEFINED.

  • tone: copy project.tone / briefing tone keyword when present.
      If the briefing names no tone, pick from {"cinematic","documentary",
      "luxury","energetic","intimate","editorial"} based on beat + mode:
        Reveal/Proof + brand   → "cinematic"
        Pain                   → "intimate"
        CTA                    → "energetic"
        Educational            → "documentary"
        default                → "cinematic"

  • performance.{mimik, gestik, blick, energy} — ALWAYS fill all four axes
    based on beat. DIALOG-SAFE: never produce gestures that occlude the
    face on dialog scenes (no "hand-on-face", "looking-down", "away" on
    lip-sync turns). Use these defaults:
        Hook           → mimik="confident",     gestik="open-palms", blick="to-camera", energy=4
        Pain / Problem → mimik="concerned",     gestik="still",      blick="to-camera", energy=2
        Reveal / Twist → mimik="focused",       gestik="point",      blick="to-camera", energy=3
        Proof / Social → mimik="confident",     gestik="open-palms", blick="to-camera", energy=3
        CTA / Endcard  → mimik="warm-smile",    gestik="open-palms", blick="to-camera", energy=4
        default        → mimik="neutral",       gestik="still",      blick="to-camera", energy=3
    Override only when the briefing names a different cue (e.g. "ruhig",
    "energetisch", "nachdenklich"). Always add the filled axes to
    scenes[i]._meta.aiFilled when the briefing did not state them.

  • seed: DO NOT auto-fill. Leave undefined unless the briefing literally
    names a number ("Seed: 12345"). Random per render is the correct A/B
    behaviour — the UI explains this.


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

═══════════════════════════════════════════════════════════════════════════
BRIEFING INTELLIGENCE v2 — mode detection + AI-fill trail
═══════════════════════════════════════════════════════════════════════════

ALWAYS set the top-level _meta object:
- _meta.mode: classify the briefing. One of:
    "storytelling" (narrative arc, characters, plot),
    "brand" (brand awareness, identity, lifestyle),
    "product" (concrete product/SaaS/feature pitch),
    "educational" (how-to, explainer, tutorial),
    "other".
- _meta.modeConfidence: 0..1.
- _meta.research: up to 8 short factual bullets you used to enrich the plan
  from general knowledge (era context, brand archetypes, audience norms,
  cinematic references). Keep facts concise. DO NOT fabricate URLs.
- _meta.aiFilled: list dotted paths of PLAN-LEVEL fields you invented because
  the briefing didn't state them, e.g. "captions.font", "voice.voiceName",
  "negativePrompt".

PER SCENE: set scenes[i]._meta.aiFilled with the dotted paths you filled
in for that scene WITHOUT explicit briefing input — examples:
  "anchorPromptEN", "shotDirector.framing", "shotDirector.lighting",
  "performance.gestik", "musicCue.energy", "brollHints", "voiceover.text".
Omit fields the briefing explicitly stated. The creator uses this list
to know what is AI-generated and what is theirs.

In LITERAL mode, DO NOT invent NARRATIVE content the briefing does not
state (voiceover.text, dialogTurns.text, brandAnchor copy). The Intelligent
Defaults above for transition / textOverlay / tone / performance ALWAYS
apply — also in LITERAL mode — because they are dramaturgical scaffolding,
not invented content.`;

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
                    voiceAutoAssigned: { type: 'boolean' },
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
- LIBRARY.locations: all locations visible in the UI: personal brand_locations plus read-only world/catalog entries. Catalog IDs are valid and look like "catalog:location:<uuid>", "catalog:building:<uuid>", or "catalog:prop:<uuid>".
- LIBRARY.voices: ElevenLabs voices known to the system (id, name, language)

Resolve every cast mention (@founder-avatar etc.) and every location mention (@home-office etc.) to a library entry. Normalize: strip "@", lowercase, remove separators (- _ space), allow substring match in either direction. When unresolved, set characterId/locationId = null and add an unresolved item with severity=warn and a clear suggestion like "Avatar 'Founder Default' im Library nicht gefunden — manuell zuordnen".

For voice resolution:
- Project-level voice: if briefing names a voice (id OR name), resolve via LIBRARY.voices.
- Per-cast voice resolution (priority order):
  1. brand_character.default_voice_id (if set and looks like an ElevenLabs id — opaque ~20-char alphanum, NEVER a UUID).
  2. AUTO-MATCH from LIBRARY.voices using briefing language (OUTPUT_LANGUAGE), character.gender, character.description (persona/age hints), and scene tonality (energetic/warm/calm/authoritative/playful).
  3. Within a single scene with multiple speakers, NEVER assign the same voiceId twice — rotate to another fitting voice from LIBRARY.voices.
- For every auto-matched voice (rule 2), add an "aiFilled" dotted entry "cast.<characterId>.voiceId" so the UI can flag it. Also set cast.voiceAutoAssigned=true.
- Voice catalog hints by gender:
  Male: George, Roger, Charlie, Liam, Eric, Chris, Brian, Daniel, Bill
  Female: Alice, Sarah, Laura, Matilda, Lily
- NEVER copy a Character-UUID into voiceId. ElevenLabs voiceIds are opaque (e.g. "JBFqnCBsd6RMkjVDRZzb").

Consistency checks (each becomes an unresolved entry when violated):
- Sum of scene durationSec must equal project.totalDurationSec (severity=warn).
- Every cinematic-sync / heygen / sync-* / native-dialogue scene MUST have at least one cast member (severity=error if none).
- VO timecodes within a scene must fit inside its durationSec (severity=warn).

DO NOT invent IDs. Only emit characterId / locationId that exist in LIBRARY. Catalog location IDs from LIBRARY are valid and should be copied exactly including the "catalog:*:" prefix. If you are unsure, set null and add an unresolved entry.`;

interface CallOpts {
  model: string;
  system: string;
  tool: any;
  user: string;
  timeoutMs?: number;
  maxTokens?: number;
  retries?: number; // total attempts = retries + 1
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

async function callGatewayOnce(opts: CallOpts): Promise<any> {
  const timeoutMs = opts.timeoutMs ?? 35_000;
  const maxTokens = opts.maxTokens ?? 6000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
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
        max_tokens: maxTokens,
        // Determinism: structured extraction against a JSON schema — near-zero temperature
        // eliminates the "sometimes correct, sometimes wrong" plan drift across identical briefings.
        temperature: 0.1,
      }),
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      const err: any = new Error(`gateway timeout after ${timeoutMs}ms (model=${opts.model})`);
      err.status = 504;
      err.retryable = true;
      throw err;
    }
    (e as any).retryable = true;
    throw e;
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(`gateway ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    err.retryable = RETRYABLE_STATUS.has(res.status);
    throw err;
  }
  const json = await res.json();
  const call = json?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    const err: any = new Error('no tool call returned');
    err.retryable = true;
    throw err;
  }
  return JSON.parse(call.function.arguments);
}

async function callGateway(opts: CallOpts): Promise<any> {
  const retries = opts.retries ?? 1;
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callGatewayOnce(opts);
    } catch (e: any) {
      lastErr = e;
      if (!e?.retryable || attempt === retries) throw e;
      const backoff = 500 + Math.floor(Math.random() * 1000) + attempt * 500;
      console.warn(`[briefing-deep-parse] retry ${attempt + 1}/${retries} for ${opts.model} after ${backoff}ms — ${e?.message?.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

interface ChainStep { model: string; timeoutMs: number; maxTokens?: number; retries?: number; }

async function callGatewayChain(base: Omit<CallOpts, 'model' | 'timeoutMs' | 'maxTokens' | 'retries'>, chain: ChainStep[], label: string): Promise<{ result: any; modelUsed: string; diagnostics: Array<{ model: string; ok: boolean; ms: number; error?: string }> }> {
  const diagnostics: Array<{ model: string; ok: boolean; ms: number; error?: string }> = [];
  let lastErr: any;
  for (const step of chain) {
    const t0 = Date.now();
    try {
      const result = await callGateway({ ...base, model: step.model, timeoutMs: step.timeoutMs, maxTokens: step.maxTokens, retries: step.retries ?? 0 });
      const ms = Date.now() - t0;
      diagnostics.push({ model: step.model, ok: true, ms });
      console.log(`[briefing-deep-parse] ${label} success in ${ms}ms (model=${step.model})`);
      return { result, modelUsed: step.model, diagnostics };
    } catch (e: any) {
      const ms = Date.now() - t0;
      const errMsg = e?.message?.slice(0, 200) ?? 'unknown';
      diagnostics.push({ model: step.model, ok: false, ms, error: errMsg });
      console.warn(`[briefing-deep-parse] ${label} failed on ${step.model} after ${ms}ms — ${errMsg}`);
      lastErr = e;
    }
  }
  throw lastErr ?? new Error(`${label}: all chain models failed`);
}


function normalizeMention(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/^@/, '')
    .replace(/^(locationid|location|ort|place|setting)\s*@?\s*/i, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function buildLocationLibrary(
  brandRows: any[] = [],
  catalogLocations: any[] = [],
  catalogBuildings: any[] = [],
  catalogProps: any[] = [],
) {
  const seen = new Set<string>();
  const out: Array<{ id: string; name: string; kind?: string; source?: string }> = [];
  const push = (id: any, name: any, source: string, kind?: string) => {
    const cleanId = typeof id === 'string' ? id.trim() : '';
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanId || !cleanName) return;
    const key = normalizeMention(cleanName);
    // Personal library wins over catalog when labels collide, mirroring
    // useUnifiedMentionLibrary.dedupe() in the frontend.
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    out.push({ id: cleanId, name: cleanName, source, kind });
  };
  for (const l of brandRows ?? []) push(l?.id, l?.name, 'brand', 'location');
  const pushCatalog = (rows: any[] = [], kind: 'location' | 'building' | 'prop') => {
    for (const r of rows ?? []) {
      push(`catalog:${kind}:${r?.id}`, r?.label ?? r?.name, 'catalog', kind);
    }
  };
  pushCatalog(catalogLocations, 'location');
  pushCatalog(catalogBuildings, 'building');
  pushCatalog(catalogProps, 'prop');
  return out;
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

/**
 * Dedupe cast slots inside a scene. Two slots are duplicates when their
 * (lowercased) `characterId` matches, or — if both lack an id — when their
 * normalized `mentionKey`/`characterName` matches. Slots with `characterId`
 * win over slots without.
 */
function dedupeSceneCast(cast: any[] | undefined | null): { cast: any[]; removed: number } {
  const input = Array.isArray(cast) ? cast : [];
  if (input.length < 2) return { cast: input, removed: 0 };
  const keyOf = (c: any) => {
    const id = typeof c?.characterId === 'string' ? c.characterId.toLowerCase().trim() : '';
    if (id) return `id:${id}`;
    const mk = normalizeMention(String(c?.mentionKey ?? c?.characterName ?? ''));
    return mk ? `mk:${mk}` : '';
  };
  const ordered = input
    .map((slot, idx) => ({ slot, idx, hasId: !!slot?.characterId }))
    .sort((a, b) => (a.hasId === b.hasId ? a.idx - b.idx : a.hasId ? -1 : 1));
  const byKey = new Map<string, { slot: any; originalIdx: number }>();
  const noKey: { slot: any; originalIdx: number }[] = [];
  for (const { slot, idx } of ordered) {
    const key = keyOf(slot);
    if (!key) { noKey.push({ slot, originalIdx: idx }); continue; }
    const existing = byKey.get(key);
    if (!existing) { byKey.set(key, { slot, originalIdx: idx }); continue; }
    // Merge: fill missing fields from duplicate.
    for (const f of ['characterId','characterName','voiceId','voiceName','shotType','outfit','outfitLookId','referenceImageUrl']) {
      if (!existing.slot[f] && slot[f]) existing.slot[f] = slot[f];
    }
    if (existing.slot.voiceAutoAssigned == null && slot.voiceAutoAssigned != null) {
      existing.slot.voiceAutoAssigned = slot.voiceAutoAssigned;
    }
  }
  const merged = [...byKey.values(), ...noKey].sort((a, b) => a.originalIdx - b.originalIdx).map((x) => x.slot);
  const removed = input.length - merged.length;
  return { cast: removed > 0 ? merged : input, removed };
}

function mergeManifestAndResolution(manifest: any, resolution: any) {
  const scenesById = new Map<number, any>();
  for (const s of resolution?.scenes ?? []) {
    if (typeof s?.index === 'number') scenesById.set(s.index, s);
  }
  const scenes = (manifest?.scenes ?? []).map((s: any, i: number) => {
    const r = scenesById.get(s.index);
    const rawCast = (s.cast ?? []).map((c: any) => {
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
        shotType: c.shotType,
        voiceId: typeof rCast?.voiceId === 'string' ? rCast.voiceId : null,
        voiceName: rCast?.voiceName,
        voiceAutoAssigned: rCast?.voiceAutoAssigned === true ? true : undefined,
        referenceImageUrl: null,
      });
    });
    const dedupMerge = dedupeSceneCast(rawCast);
    if (dedupMerge.removed > 0) {
      console.log('[briefing-deep-parse] plan_cast_dedup', { stage: 'merge', scene: s.index, removed: dedupMerge.removed });
    }
    const cast = dedupMerge.cast;
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

    // Per-scene aiFilled trail (BriefingIntel v2). Sanitized: stringify,
    // de-dupe, max 30 entries. UI shows a ✨ badge next to these fields.
    let sceneMeta: any = undefined;
    if (s._meta && Array.isArray(s._meta.aiFilled)) {
      const af = Array.from(new Set(
        s._meta.aiFilled.map((p: any) => String(p ?? '').trim()).filter(Boolean),
      )).slice(0, 30);
      if (af.length) sceneMeta = { aiFilled: af };
    }

    return stripUndef({
      index: Number.isFinite(Number(s.index)) ? Math.max(1, Math.floor(Number(s.index))) : i + 1,
      label: s.label,
      beat: s.beat,
      durationSec,
      engine,
      lipSync: s.lipSync === true
        || ['cinematic-sync','sync-polish','sync-segments','native-dialogue','heygen'].includes(engine),
      voiceover: (() => {
        // v177.1 — Clamp voiceover timecodes to scene duration to avoid
        // cosmetic "VO endet nach Szene" warnings from purely model-rounding.
        const vo: any = s.voiceover;
        if (!vo || typeof vo !== 'object') return vo;
        const out = { ...vo };
        if (Number.isFinite(Number(out.timecodeStartSec))) {
          out.timecodeStartSec = Math.max(0, Math.min(Number(out.timecodeStartSec), durationSec));
        }
        if (Number.isFinite(Number(out.timecodeEndSec))) {
          out.timecodeEndSec = Math.max(0, Math.min(Number(out.timecodeEndSec), durationSec));
        }
        return out;
      })(),
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
      _meta: sceneMeta,
    });
  });

  // Re-index sequentially (1..N) to guarantee unique scene.index values.
  // Pass A occasionally returns duplicate or 0-based indices which collide
  // after Math.max(1, ...) — UI would silently drop the duplicates.
  scenes.forEach((s: any, i: number) => { s.index = i + 1; });

  console.log('[briefing-deep-parse] merge done — scenes:', scenes.length, 'unresolved:', (resolution?.unresolved ?? []).length);

  // Plan-level _meta (mode, research, aiFilled) sanitized.
  let planMeta: any = undefined;
  if (manifest?._meta && typeof manifest._meta === 'object') {
    const m = manifest._meta;
    const modeRaw = String(m.mode ?? '').toLowerCase();
    const ALLOWED_MODE = new Set(['storytelling','brand','product','educational','other']);
    const research = Array.isArray(m.research)
      ? m.research
          .map((r: any) => stripUndef({
            fact: String(r?.fact ?? '').trim().slice(0, 400),
            source: r?.source ? String(r.source).slice(0, 120) : undefined,
          }))
          .filter((r: any) => r.fact)
          .slice(0, 20)
      : undefined;
    const aiFilled = Array.isArray(m.aiFilled)
      ? Array.from(new Set(m.aiFilled.map((p: any) => String(p ?? '').trim()).filter(Boolean))).slice(0, 40)
      : undefined;
    planMeta = stripUndef({
      mode: ALLOWED_MODE.has(modeRaw) ? modeRaw : (modeRaw ? 'other' : undefined),
      modeConfidence: typeof m.modeConfidence === 'number'
        ? clamp(m.modeConfidence, 0, 1, 0.5)
        : undefined,
      research: research?.length ? research : undefined,
      aiFilled: aiFilled?.length ? aiFilled : undefined,
    });
    if (!Object.keys(planMeta).length) planMeta = undefined;
  }

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
    _meta: planMeta,
  };
}

function extractSelectedCastFromBriefing(briefing: string, characters: any[]) {
  const out: any[] = [];
  const seen = new Set<string>();
  const castSection = String(briefing ?? '').split(/##\s+Cast[^\n]*\n/i)[1]?.split(/\n##\s+/)[0] ?? '';
  // v212 fix: previous single regex used a greedy `[^\n]*` before an optional
  // `(library:UUID)` group, so the library id NEVER captured. Parse line-by-line
  // and match mention + library UUID independently.
  const UUID_RE = /\(library:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/i;
  const MENTION_RE = /@([a-z0-9][a-z0-9-_]{1,47})/i;
  for (const rawLine of castSection.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('-')) continue;
    const mm = line.match(MENTION_RE);
    if (!mm) continue;
    const mentionKey = `@${mm[1]}`;
    const libId = line.match(UUID_RE)?.[1] ?? null;
    const needle = normalizeMention(mentionKey);
    const hit = libId
      ? characters.find((ch: any) => String(ch.id).toLowerCase() === libId.toLowerCase())
      : characters.find((ch: any) => {
          const n = normalizeMention(ch.name);
          return n && needle && (n.includes(needle) || needle.includes(n));
        });
    const key = String(hit?.id ?? needle);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      mentionKey,
      characterId: hit?.id ?? null,
      characterName: hit?.name ?? mentionKey.replace(/^@/, ''),
      voiceId: hit?.default_voice_id ?? null,
    });
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * v212 Strict-Cast enforcement. Runs after ensemble-repair when the briefing
 * has a deterministic cast (all required chars resolved to library UUIDs).
 *
 * Removes hallucinated cast slots (Pass B invents dialogue speakers like
 * "George", "Roger" that aren't briefed) and back-fills unresolved slots that
 * match a briefed mentionKey. Then dedupes.
 */
function enforceStrictCast(plan: any, required: any[]) {
  if (!Array.isArray(plan?.scenes) || required.length === 0) return { dropped: 0, backfilled: 0 };
  if (required.some((r) => !r.characterId)) return { dropped: 0, backfilled: 0 };
  const idSet = new Set(required.map((r) => String(r.characterId).toLowerCase()));
  const byMention = new Map<string, any>();
  for (const r of required) {
    const mk = normalizeMention(r.mentionKey || r.characterName || '');
    if (mk) byMention.set(mk, r);
  }
  let dropped = 0;
  let backfilled = 0;
  for (const sc of plan.scenes) {
    if (!Array.isArray(sc.cast)) continue;
    const kept: any[] = [];
    for (const c of sc.cast) {
      const id = typeof c?.characterId === 'string' ? c.characterId.toLowerCase() : '';
      if (id) {
        if (idSet.has(id)) kept.push(c);
        else dropped += 1;
        continue;
      }
      const mk = normalizeMention(c?.mentionKey || c?.characterName || '');
      const hit = mk ? byMention.get(mk) : null;
      if (hit) {
        c.characterId = hit.characterId;
        c.characterName = hit.characterName ?? c.characterName;
        if (!c.voiceId && hit.voiceId) c.voiceId = hit.voiceId;
        if (!c.mentionKey && hit.mentionKey) c.mentionKey = hit.mentionKey;
        backfilled += 1;
        kept.push(c);
      } else {
        dropped += 1;
      }
    }
    if (kept.length !== sc.cast.length) sc.cast = kept;
    const d = dedupeSceneCast(sc.cast);
    if (d.removed > 0) sc.cast = d.cast;
  }
  return { dropped, backfilled };
}

function ensureProductionPlanEnsembleServer(plan: any, briefing: string, characters: any[]) {
  const required = extractSelectedCastFromBriefing(briefing, characters);
  const scenes = Array.isArray(plan?.scenes) ? plan.scenes : [];
  if (required.length < 2 || scenes.length === 0) return { repaired: 0, required: required.length };

  const keyOf = (c: any) => String(c?.characterId || normalizeMention(c?.mentionKey || c?.characterName || '')).trim();
  const requiredKeys = new Set(required.map(keyOf).filter(Boolean));
  const hasAll = (sc: any) => {
    const keys = new Set((sc?.cast ?? []).map(keyOf).filter(Boolean));
    for (const key of requiredKeys) if (!keys.has(key)) return false;
    return true;
  };
  const coverage = (sc: any) => {
    const keys = new Set((sc?.cast ?? []).map(keyOf).filter(Boolean));
    let n = 0;
    for (const key of requiredKeys) if (keys.has(key)) n += 1;
    return n;
  };
  const requiredEnsembles = scenes.length >= 6 ? 2 : 1;
  const current = scenes.filter(hasAll).length;
  if (current >= requiredEnsembles) return { repaired: 0, required: required.length };

  // C-2 fix — collect first outfitLookId per characterId across all existing scenes
  // so ensemble-injected cast slots inherit the correct wardrobe instead of the bare portrait.
  const outfitByCharacterId = new Map<string, string>();
  for (const sc of scenes) {
    for (const c of (sc?.cast ?? []) as any[]) {
      if (c?.characterId && c?.outfitLookId && !outfitByCharacterId.has(c.characterId)) {
        outfitByCharacterId.set(c.characterId, c.outfitLookId);
      }
    }
  }

  const middle: number[] = [];
  for (let i = 1; i < scenes.length - 1; i++) middle.push(i);
  middle.sort((a, b) => coverage(scenes[b]) - coverage(scenes[a]));
  const order = [0];
  if (scenes.length > 1) order.push(scenes.length - 1);
  order.push(...middle);

  let repaired = 0;
  const needed = requiredEnsembles - current;
  const names = required.map((c) => c.characterName || String(c.mentionKey).replace(/^@/, ''));
  const joinedNames = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const sentence = `${joinedNames} share the scene together in a wide group shot, all faces clearly visible to camera, standing side by side, each with a distinct visible action.`;

  // C-1 fix — build a new scenes array; do NOT mutate input objects in place.
  const nextScenes = scenes.slice();
  const toRepair = new Set<number>();
  {
    const ordered = order.filter((idx) => scenes[idx] && !hasAll(scenes[idx]));
    for (const idx of ordered) {
      if (toRepair.size >= needed) break;
      toRepair.add(idx);
    }
  }

  for (const idx of order) {
    if (!toRepair.has(idx)) continue;
    const sc = scenes[idx];
    const cast = Array.isArray(sc.cast) ? [...sc.cast] : [];
    const present = new Set(cast.map(keyOf).filter(Boolean));
    for (const c of required) {
      const key = keyOf(c);
      if (present.has(key)) continue;
      if (cast.length >= 4) break;
      const look = c.characterId ? outfitByCharacterId.get(c.characterId) ?? null : null;
      cast.push({ ...c, shotType: 'full', ...(look ? { outfitLookId: look } : {}) });
      present.add(key);
    }
    const dedup = dedupeSceneCast(cast);
    if (dedup.removed > 0) {
      console.log('[briefing-deep-parse] plan_cast_dedup', { stage: 'ensemble', scene: sc?.index, removed: dedup.removed });
    }
    const prompt = String(sc.anchorPromptEN ?? '').trim();
    const nextAnchor = prompt.toLowerCase().includes(joinedNames.toLowerCase())
      ? prompt
      : (prompt ? `${prompt} ${sentence}` : sentence);
    nextScenes[idx] = {
      ...sc,
      cast: dedup.cast,
      engine: 'cinematic-sync',
      lipSync: true,
      shotDirector: {
        ...(sc.shotDirector ?? {}),
        framing: 'wide',
        angle: sc.shotDirector?.angle ?? 'eye-level',
        movement: sc.shotDirector?.movement ?? 'static',
      },
      anchorPromptEN: nextAnchor,
      _meta: {
        ...(sc._meta ?? {}),
        aiFilled: Array.from(new Set([
          ...((sc._meta?.aiFilled ?? []) as string[]),
          'cast.ensembleGuarantee',
          'shotDirector.framing',
          'anchorPromptEN',
        ])),
      },
    };
    repaired += 1;
  }

  if (repaired > 0) {
    plan.scenes = nextScenes;
    console.log('[briefing-deep-parse] production_plan_ensemble_repair', { repaired, scenes: nextScenes.length, cast: required.length });
  }
  return { repaired, required: required.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "briefing-deep-parse" });
  }

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
    // v176: coerce empty/whitespace strings to null so the UUID column doesn't
    // reject the insert with "22P02 invalid input syntax for type uuid".
    const rawProjectId = body?.projectId;
    const projectId: string | null =
      typeof rawProjectId === 'string' && rawProjectId.trim().length > 0
        ? rawProjectId.trim()
        : null;
    // Telemetry: surface NULL projectId so we can trace which caller failed
    // to wire activeProjectId through `ensureProjectId` (Edge-Function logs).
    if (!projectId) {
      console.warn('[briefing-deep-parse] projectId NULL — plan will not be linked to a project', {
        userId,
        briefingLen: briefing.length,
        rawProjectIdType: typeof rawProjectId,
        rawProjectIdEmpty: typeof rawProjectId === 'string' && rawProjectId.trim().length === 0,
      });
    }
    const rawLang: string = String(body?.language ?? 'de').toLowerCase().slice(0, 5);
    const LANG_NAME: Record<string, string> = {
      de: 'German (Deutsch)', en: 'English', es: 'Spanish (Español)',
      fr: 'French', it: 'Italian', pt: 'Portuguese', nl: 'Dutch', pl: 'Polish',
    };
    const langKey = rawLang.split('-')[0];
    const languageDisplay = LANG_NAME[langKey] ?? rawLang.toUpperCase();
    const LANGUAGE_LOCK = `
═══════════════════════════════════════════════════════════════════════════
LANGUAGE LOCK — output language: ${languageDisplay} [${langKey}]
═══════════════════════════════════════════════════════════════════════════
ALL human-readable text fields MUST be written in ${languageDisplay}:
  - scenes[*].voiceover.text
  - scenes[*].dialogTurns[*].text  (and .mood, .delivery)
  - scenes[*].label, scenes[*].beat
  - scenes[*].performance.{mimik, gestik, blick}
  - captions.highlightWords
ENGLISH-ONLY fields (visual prompts consumed by AI models — DO NOT translate):
  - scenes[*].anchorPromptEN
  - scenes[*].brollHints
  - scenes[*].shotDirector.* enums
  - negativePrompt / negativePromptScene
This overrides any English wording in the briefing's scaffolding
(## Cast, ## Project headers, mention keys, etc.).
═══════════════════════════════════════════════════════════════════════════
`;
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

    // ── Pass A + Library snapshot in parallel ────────────────────────────
    // Pass A uses a fast model chain: Flash (2 attempts) → Pro (1) → Flash-Lite (1).
    // Flash handles ~99% of briefings in 8-25s; Pro is only touched if Flash fails twice.
    let manifest: any;
    let passAError: string | null = null;
    let passADiagnostics: Array<{ model: string; ok: boolean; ms: number; error?: string }> = [];
    let passAModelUsed = 'unknown';

    const passAPromise = callGatewayChain(
      {
        system: LANGUAGE_LOCK + '\n' + SYSTEM_PASS_A,
        tool: TOOL_PASS_A,
        user: `BRIEFING (source language: ${languageDisplay}):\n\n${briefing}`,
      },
      [
        { model: 'google/gemini-2.5-flash',      timeoutMs: 35_000, maxTokens: 6000, retries: 1 },
        { model: 'google/gemini-2.5-pro',        timeoutMs: 60_000, maxTokens: 6000, retries: 0 },
        { model: 'google/gemini-2.5-flash-lite', timeoutMs: 25_000, maxTokens: 6000, retries: 0 },
      ],
      'Pass A',
    );

    const libraryPromise = Promise.all([
      supabase
        .from('brand_characters')
        .select('id,name,default_voice_id,gender,description')
        .eq('user_id', userId)
        .limit(200),
      supabase
        .from('brand_locations')
        .select('id,name')
        .eq('user_id', userId)
        .limit(200),
      supabase
        .from('location_catalog_previews')
        .select('id,label,theme_pack')
        .order('theme_pack', { ascending: true })
        .order('label', { ascending: true })
        .limit(500),
      supabase
        .from('building_catalog_previews')
        .select('id,label,theme_pack')
        .order('theme_pack', { ascending: true })
        .order('label', { ascending: true })
        .limit(500),
      supabase
        .from('prop_catalog_previews')
        .select('id,label,theme_pack')
        .order('theme_pack', { ascending: true })
        .order('label', { ascending: true })
        .limit(500),
    ]);

    const [passAResult, libResult] = await Promise.allSettled([passAPromise, libraryPromise]);

    if (passAResult.status === 'fulfilled') {
      manifest = passAResult.value.result;
      passAModelUsed = passAResult.value.modelUsed;
      passADiagnostics = passAResult.value.diagnostics;
    } else {
      passAError = passAResult.reason?.message ?? 'pass A failed';
      passADiagnostics = (passAResult.reason as any)?.diagnostics ?? [];
      console.error('[briefing-deep-parse] Pass A chain exhausted — using synthesized arc:', passAError);
      manifest = { project: {}, scenes: [] };
    }
    const tA = Date.now();

    const [charRes, locRes, catalogLocRes, catalogBuildingRes, catalogPropRes] = libResult.status === 'fulfilled'
      ? libResult.value
      : [{ data: [] } as any, { data: [] } as any, { data: [] } as any, { data: [] } as any, { data: [] } as any];

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

    // ── v177: Scene-count guard — when the briefing literally names N scenes
    //    but Gemini over-/under-shot, truncate/pad to N and redistribute
    //    durationSec evenly across project.totalDurationSec. Pass B then runs
    //    on the corrected list.
    let sceneCountCorrection: { detected: number; gemini: number } | null = null;
    try {
      const text = String(briefing ?? '');
      // a) explicit "N Szenen / scenes / shots / beats"
      const numWordMatch = text.match(/(\d{1,2})\s*(szenen?|scenes?|shots?|beats?)\b/i);
      const numFromWord = numWordMatch ? parseInt(numWordMatch[1], 10) : null;
      // b) numbered markers "Szene 1", "Scene 2", "Shot 3"  → take max
      const markerRe = /\b(?:szene|scene|shot)\s*(\d{1,2})\b/gi;
      let maxMarker = 0;
      for (const m of text.matchAll(markerRe)) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n)) maxMarker = Math.max(maxMarker, n);
      }
      // c) numbered list "1." "2." "3." at line start  → count ≥3
      const listMatches = text.match(/^\s*\d{1,2}[.):]\s+\S/gm);
      const listCount = listMatches && listMatches.length >= 3 ? listMatches.length : 0;

      const candidates = [numFromWord, maxMarker || null, listCount || null]
        .filter((n): n is number => typeof n === 'number' && n >= 1 && n <= 12);
      // Prefer the most specific: numbered markers > "N Szenen" word > list count
      const detected = maxMarker >= 2 ? maxMarker : (numFromWord ?? (listCount >= 3 ? listCount : null));

      if (detected && Array.isArray(manifest?.scenes)) {
        const got = manifest.scenes.length;
        if (got !== detected) {
          const total = Number(manifest?.project?.totalDurationSec) || (got * 5);
          const perScene = Math.max(2, Math.min(30, Math.round(total / detected)));
          if (got > detected) {
            // Truncate keep first N
            manifest.scenes = manifest.scenes.slice(0, detected);
          } else {
            // v178 Wave 2 — Slot inheritance on pad.
            // Find a template scene (last scene with non-empty cast, else
            // first scene, else empty). Clone its cast/location/shotDirector/
            // engine into every padded scene so ProductionPlanSheet and
            // SceneCard render the same Sprecher/Outfit/Location dropdowns
            // for ALL scenes — never empty {engine:'broll'} skeletons.
            const beatRing = ['Hook', 'Pain', 'Reveal', 'Proof', 'CTA'];
            const template =
              [...manifest.scenes].reverse().find((x: any) => Array.isArray(x?.cast) && x.cast.length > 0)
              ?? manifest.scenes[0]
              ?? {};
            // SC-1: preserve characterId + outfitLookId on padded scenes so
            // ensemble-repair does not append duplicates and outfits survive.
            const cloneCast = (cast: any[] | undefined) =>
              Array.isArray(cast)
                ? cast.map((c: any) => {
                    const out: any = { mentionKey: c?.mentionKey };
                    if (c?.characterId) out.characterId = c.characterId;
                    if (c?.characterName) out.characterName = c.characterName;
                    if (c?.outfit) out.outfit = c.outfit;
                    if (c?.outfitLookId) out.outfitLookId = c.outfitLookId;
                    if (c?.referenceImageUrl) out.referenceImageUrl = c.referenceImageUrl;
                    return out;
                    // per-turn fields (voiceover text etc.) are intentionally stripped
                  })
                : undefined;
            const cloneLocation = (loc: any) => {
              if (!loc || typeof loc !== 'object') return undefined;
              const out: any = {};
              if (loc.mentionKey) out.mentionKey = loc.mentionKey;
              if (loc.locationId) out.locationId = loc.locationId;
              if (loc.locationName) out.locationName = loc.locationName;
              return out.mentionKey || out.locationId ? out : undefined;
            };
            while (manifest.scenes.length < detected) {
              const i = manifest.scenes.length;
              const padded: any = {
                index: i + 1,
                label: beatRing[i % beatRing.length],
                beat: beatRing[i % beatRing.length],
                durationSec: perScene,
                engine: template.engine ?? 'broll',
                cast: cloneCast(template.cast),
                location: cloneLocation(template.location),
                shotDirector: template.shotDirector ? { ...template.shotDirector } : undefined,
                _meta: { aiFilled: ['padded_from_template'] },
              };
              // Drop undefined keys so downstream `stripUndef` stays clean.
              if (!padded.cast) delete padded.cast;
              if (!padded.location) delete padded.location;
              if (!padded.shotDirector) delete padded.shotDirector;
              manifest.scenes.push(padded);
            }
          }
          // Redistribute durations + reindex
          manifest.scenes = manifest.scenes.map((s: any, i: number) => ({
            ...s,
            index: i + 1,
            durationSec: perScene,
          }));
          if (!manifest.project) manifest.project = {};
          manifest.project.totalDurationSec = perScene * detected;
          sceneCountCorrection = { detected, gemini: got };
          console.log('[briefing-deep-parse] scene_count_corrected', { detected, gemini: got, perScene });
        }
      }
    } catch (e: any) {
      console.warn('[briefing-deep-parse] scene-count guard failed (non-fatal):', e?.message);
    }

    const characters = charRes.data ?? [];
    const locations = buildLocationLibrary(
      locRes.data ?? [],
      catalogLocRes.data ?? [],
      catalogBuildingRes.data ?? [],
      catalogPropRes.data ?? [],
    );


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
    let passBDiagnostics: Array<{ model: string; ok: boolean; ms: number; error?: string }> = [];
    let passBModelUsed: string | null = null;
    let passBError: string | null = null;
    try {
      const passBOut = await callGatewayChain(
        {
          system: LANGUAGE_LOCK + '\n' + SYSTEM_PASS_B,
          tool: TOOL_PASS_B,
          user: JSON.stringify({
            OUTPUT_LANGUAGE: langKey,
            MANIFEST: manifest,
            LIBRARY: {
              characters: characters.map((c: any) => ({ id: c.id, name: c.name, default_voice_id: c.default_voice_id, gender: c.gender, description: c.description })),
              locations: locations.map((l: any) => ({ id: l.id, name: l.name, kind: l.kind, source: l.source })),
              voices,
            },
          }),
        },
        [
          { model: 'google/gemini-2.5-flash',      timeoutMs: 30_000, maxTokens: 4000, retries: 1 },
          { model: 'google/gemini-2.5-flash-lite', timeoutMs: 20_000, maxTokens: 4000, retries: 0 },
        ],
        'Pass B',
      );
      resolution = passBOut.result;
      passBDiagnostics = passBOut.diagnostics;
      passBModelUsed = passBDiagnostics.find((d) => d.ok)?.model ?? null;
    } catch (e: any) {
      console.warn('[briefing-deep-parse] Pass B failed, falling back to local resolution:', e?.message);
      passBDiagnostics = (e as any)?.diagnostics ?? [];
      passBError = e?.message ?? String(e);
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
      // Mini-Patch: reject UUID-shaped voiceIds (almost always a Character-UUID
      // that leaked into voiceId from Gemini) and back-fill from the resolved
      // character's default_voice_id. ElevenLabs voice IDs are opaque 20-char
      // alphanum strings, never UUIDs.
      const looksLikeUuid = (v: any) =>
        typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      const charById = new Map<string, any>(characters.map((c: any) => [String(c.id), c]));
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
          // Repair: voiceId carries a Character-UUID → swap for that
          // character's default_voice_id, or null it out.
          if (looksLikeUuid(c.voiceId)) {
            const ch = charById.get(String(c.voiceId)) ?? (c.characterId ? charById.get(String(c.characterId)) : null);
            const def = ch?.default_voice_id;
            c.voiceId = typeof def === 'string' && !looksLikeUuid(def) ? def : null;
          }
          if (!c.voiceId && c.characterId) {
            const ch = charById.get(String(c.characterId));
            const def = ch?.default_voice_id;
            if (typeof def === 'string' && !looksLikeUuid(def)) c.voiceId = def;
          }
          if (!c.voiceId && projectVoiceId && !looksLikeUuid(projectVoiceId)) c.voiceId = projectVoiceId;
        }
      }
      // AUTO-MATCH pass — V-2: plan-level tracking so (a) each characterId
      // keeps ONE stable voice across all scenes, and (b) different characters
      // never share the same auto-picked voice within the plan.
      const MALE_POOL = ['nPczCjzI2devNBz1zQrb','TX3LPaxmHKxFdv7VOQHJ','JBFqnCBsd6RMkjVDRZzb','IKne3meq5aSn9XLyUdCD','cjVigY5qzO86Huf0OWal','iP95p4xoKVk53GoZ742B','onwK4e9ZLuTAKqWW03F9','pqHfZKP75CvOlQylNhV4','CwhRBWXzGAHq8TQ4Fs17'];
      const FEMALE_POOL = ['EXAVITQu4vr4xnSDxMaL','FGY2WhTYpPnrIDTdsKH5','Xb7hH8MSUJpSbSDYk0k2','XrExE9yKIg1WjnnlVkGX','pFZP5JQG7iQjIQuC4Bku'];
      const voiceByCharacterId = new Map<string, string>();
      const usedGlobal = new Set<string>();
      const voicePoolStats = { autoAssigned: 0, reusedForCharacter: 0, uniqueVoices: 0 };
      (plan as any)._voicePoolStats = voicePoolStats;
      // Seed with already-resolved (character → voice) mappings so auto-pick
      // does not steal a voice that a resolved character already owns.
      for (const sc of plan.scenes ?? []) {
        for (const c of sc.cast ?? []) {
          if (c.characterId && typeof c.voiceId === 'string' && c.voiceId) {
            if (!voiceByCharacterId.has(c.characterId)) voiceByCharacterId.set(c.characterId, c.voiceId);
            usedGlobal.add(c.voiceId);
          }
        }
      }
      for (const sc of plan.scenes ?? []) {
        const usedInScene = new Set<string>(
          (sc.cast ?? []).map((c: any) => c.voiceId).filter((v: any) => typeof v === 'string'),
        );
        for (const c of sc.cast ?? []) {
          if (c.voiceId) continue;
          // (a) Reuse the voice we've already picked for this character.
          if (c.characterId && voiceByCharacterId.has(c.characterId)) {
            c.voiceId = voiceByCharacterId.get(c.characterId)!;
            c.voiceAutoAssigned = true;
            usedInScene.add(c.voiceId);
            voicePoolStats.reusedForCharacter += 1;
            continue;
          }
          const ch = c.characterId ? charById.get(String(c.characterId)) : null;
          const gender = String(ch?.gender ?? '').toLowerCase();
          const pool = gender.startsWith('f') || gender === 'weiblich' || gender === 'female'
            ? FEMALE_POOL : MALE_POOL;
          // (b) Prefer a voice unused anywhere in the plan, then unused in scene,
          //     then fallback to pool[0].
          const pick =
            pool.find((v) => !usedGlobal.has(v) && !usedInScene.has(v))
            ?? pool.find((v) => !usedInScene.has(v))
            ?? pool[0];
          if (pick) {
            c.voiceId = pick;
            c.voiceAutoAssigned = true;
            usedInScene.add(pick);
            usedGlobal.add(pick);
            voicePoolStats.autoAssigned += 1;
            if (c.characterId) voiceByCharacterId.set(c.characterId, pick);
            try {
              plan.aiFilled = Array.isArray(plan.aiFilled) ? plan.aiFilled : [];
              if (c.characterId) plan.aiFilled.push(`cast.${c.characterId}.voiceId`);
            } catch { /* noop */ }
          }
        }
      }
      voicePoolStats.uniqueVoices = usedGlobal.size;

      // Dedupe cast after local fill-pass: back-filled `characterId`s may have
      // collapsed two mentionKey-only slots onto the same character.
      let dedupTotal = 0;
      for (const sc of plan.scenes ?? []) {
        const d = dedupeSceneCast(sc.cast);
        if (d.removed > 0) {
          sc.cast = d.cast;
          dedupTotal += d.removed;
        }
      }
      if (dedupTotal > 0) {
        console.log('[briefing-deep-parse] plan_cast_dedup', { stage: 'fill-pass', removed: dedupTotal });
      }



      // v177: Local LOCATION fill-pass — analog to cast. Pass-B (Gemini)
      // sometimes returns locationId=null for slug-style mentions like
      // "@home-office" even though the library carries "Home Office".
      // Substring-match both directions via normalizeMention.
      const resolvedLocationIndexes = new Set<number>();
      const UUID_RE_LOC = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const locStats = { viaSlug: 0, viaSubstring: 0, viaCatalogUuid: 0, stillUnresolved: 0 };
      const locationIdSet = new Set(locations.map((l: any) => String(l.id)));
      for (const sc of plan.scenes ?? []) {
        const loc = sc?.location;
        if (!loc) continue;
        if (loc.locationId && locationIdSet.has(String(loc.locationId))) {
          const hit = locations.find((l: any) => String(l.id) === String(loc.locationId));
          if (hit) {
            loc.locationId = hit.id;
            loc.locationName = hit.name;
            resolvedLocationIndexes.add(sc.index);
            if (String(hit.id).startsWith('catalog:')) locStats.viaCatalogUuid += 1;
            continue;
          }
        }
        // (c) Catalog multi-segment id like "catalog:location:<uuid>" or
        // any string that already carries a UUID — extract & verify against
        // the user's library so the Sheet dropdown actually matches.
        if (loc.locationId && typeof loc.locationId === 'string' && loc.locationId.includes(':')) {
          const m = loc.locationId.match(UUID_RE_LOC);
          if (m) {
            const hit = locations.find((l: any) => String(l.id) === m[0] || String(l.id).endsWith(`:${m[0]}`));
            if (hit) {
              loc.locationId = hit.id;
              loc.locationName = hit.name;
              resolvedLocationIndexes.add(sc.index);
              locStats.viaCatalogUuid += 1;
              continue;
            } else {
              // UUID didn't match user library → null it out so the UI
              // can offer "Als Location speichern" instead of a dead id.
              loc.locationId = null;
            }
          }
        }
        if (!loc.locationId) {
          const rawMention = String(loc.mentionKey ?? loc.locationName ?? '');
          const needle = normalizeMention(rawMention);
          if (needle) {
            // (a) exact slug match
            let hit = locations.find((l: any) => normalizeMention(l.name) === needle);
            if (hit) {
              locStats.viaSlug += 1;
            } else {
              // (b) substring both directions
              hit = locations.find((l: any) => {
                const n = normalizeMention(l.name);
                return n && (n.includes(needle) || needle.includes(n));
              });
              if (hit) locStats.viaSubstring += 1;
            }
            if (hit) {
              loc.locationId = hit.id;
              loc.locationName = hit.name;
              resolvedLocationIndexes.add(sc.index);
              console.log('[briefing-deep-parse] location_local_fill', {
                scene: sc.index, mention: loc.mentionKey, resolved: hit.name,
              });
            } else {
              locStats.stillUnresolved += 1;
            }
          }
        }
      }
      // expose to parser_meta via plan (read below when persisting)
      (plan as any)._locationResolution = locStats;
      // Drop now-resolved entries from plan.unresolved
      if (resolvedLocationIndexes.size > 0 && Array.isArray(plan.unresolved)) {
        plan.unresolved = plan.unresolved.filter((u: any) => {
          const m = String(u?.path ?? u?.field ?? '').match(/scenes\[(\d+)\]\.location\.locationId/);
          if (!m) return true;
          const arrIdx = parseInt(m[1], 10);
          // Pass-B has produced both 0-based array paths (scenes[0]) and
          // 1-based scene.index paths (scenes[1]). Treat either as resolved.
          return !(resolvedLocationIndexes.has(arrIdx) || resolvedLocationIndexes.has(arrIdx + 1));
        });
      }

      // Also clean the project-level voice (UUID-shaped → null).
      if (plan?.voice && looksLikeUuid((plan.voice as any).voiceId)) {
        (plan.voice as any).voiceId = null;
      }
    } catch (e: any) {
      console.warn('[briefing-deep-parse] local fill-pass failed (non-fatal):', e?.message);
    }

    let ensembleStats: { repaired: number; required: number } | null = null;
    let strictCastStats: { dropped: number; backfilled: number } | null = null;
    try {
      ensembleStats = ensureProductionPlanEnsembleServer(plan, briefing, characters);
      if (ensembleStats.repaired > 0) {
        (plan as any)._meta = {
          ...((plan as any)._meta ?? {}),
          aiFilled: Array.from(new Set([
            ...(((plan as any)._meta?.aiFilled ?? []) as string[]),
            'scenes.cast.ensembleGuarantee',
          ])),
        };
      }
    } catch (e: any) {
      console.warn('[briefing-deep-parse] ensemble repair failed (non-fatal):', e?.message);
    }

    // v212 — Strict-Cast Pass: remove hallucinated Pass-B speakers ("George",
    // "Roger" …) that are not part of the briefed cast, and back-fill any
    // still-unresolved slot whose mentionKey matches a briefed character.
    try {
      const required = extractSelectedCastFromBriefing(briefing, characters);
      strictCastStats = enforceStrictCast(plan, required);
      if (strictCastStats.dropped > 0 || strictCastStats.backfilled > 0) {
        console.log('[briefing-deep-parse] strict_cast', strictCastStats);
      }
    } catch (e: any) {
      console.warn('[briefing-deep-parse] strict cast pass failed (non-fatal):', e?.message);
    }




    // ── Pass C — Catalog-ID Resolver (v178, Wave 1) ───────────────────────
    // Maps free-text axis values (Mimik/Gestik/Blick/Energy/Framing/Angle/
    // Movement/Lighting/Delivery/MusicEnergy/StylePreset) to stable catalog
    // IDs. Shadow fields only — original strings remain untouched so legacy
    // consumers keep working. UI / render switch to *Id in later waves.
    const passCStats = { resolved: 0, unresolved: 0, unresolvedSamples: [] as Array<{ axis: string; raw: string }> };
    try {
      const setId = (obj: any, key: string, axis: CatalogAxis, raw: unknown) => {
        if (!obj || typeof obj !== 'object') return;
        if (obj[key] != null) return; // already an id
        const id = resolveCatalogId(axis, raw);
        if (id) {
          obj[key] = id;
          passCStats.resolved += 1;
        } else if (raw != null && String(raw).trim()) {
          passCStats.unresolved += 1;
          if (passCStats.unresolvedSamples.length < 20) {
            passCStats.unresolvedSamples.push({ axis, raw: String(raw).slice(0, 80) });
          }
        }
      };

      for (const sc of plan.scenes ?? []) {
        // Performance axes
        const p = sc.performance ?? (sc.performance = {});
        setId(p, 'mimikId',  'mimik',  p.mimik);
        setId(p, 'gestikId', 'gestik', p.gestik);
        setId(p, 'blickId',  'blick',  p.blick);
        // Energy can come as number (1..5) or string — normalize to slug.
        const energyRaw = typeof p.energy === 'number'
          ? (['very_low','low','mid','high','very_high'][Math.min(4, Math.max(0, p.energy - 1))] ?? null)
          : p.energy;
        setId(p, 'energyId', 'energy', energyRaw);

        // Shot Director axes
        const sd = sc.shotDirector ?? (sc.shotDirector = {});
        setId(sd, 'framingId',     'framing',      sd.framing);
        setId(sd, 'angleId',       'angle',        sd.angle);
        setId(sd, 'movementId',    'movement',     sd.movement);
        setId(sd, 'lightingId',    'lighting',     sd.lighting);
        setId(sd, 'stylePresetId', 'style_preset', sd.stylePreset);

        // Voiceover delivery
        if (sc.voiceover && typeof sc.voiceover === 'object') {
          setId(sc.voiceover, 'deliveryId', 'delivery', sc.voiceover.delivery);
        }

        // Music cue energy
        if (sc.musicCue && typeof sc.musicCue === 'object') {
          setId(sc.musicCue, 'energyId', 'music_energy', sc.musicCue.energy);
        }
      }

      console.log('[briefing-deep-parse] pass_c_catalog_resolved', {
        resolved: passCStats.resolved,
        unresolved: passCStats.unresolved,
        samples: passCStats.unresolvedSamples,
        version: CATALOG_VERSION,
      });
    } catch (e: any) {
      console.warn('[briefing-deep-parse] pass-C catalog resolver failed (non-fatal):', e?.message);
    }

    // ── v202 — Cast & World ID-Registry: emit sceneAssets per scene ───────
    // Derived from the already-resolved cast[].characterId +
    // location.locationId. Enables the client applier to write
    // composer_scenes.scene_assets at INSERT time (no JIT-backfill).
    const UUID_ONLY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const v202Stats = { total: 0, characters: 0, locations: 0, pending: 0 };
    try {
      for (const sc of plan.scenes ?? []) {
        const refs: Array<{ type: string; id: string; variantId?: string | null; role?: string | null; displayName?: string | null }> = [];
        const seenChar = new Set<string>();
        for (const c of sc.cast ?? []) {
          const raw = typeof c?.characterId === 'string' ? c.characterId : null;
          if (!raw) { v202Stats.pending += 1; continue; }
          const m = raw.match(UUID_ONLY);
          const id = m ? m[0] : null;
          if (!id || seenChar.has(id)) continue;
          seenChar.add(id);
          refs.push({
            type: 'character',
            id,
            variantId: c?.outfitLookId ?? null,
            displayName: c?.characterName ?? null,
          });
          v202Stats.characters += 1;
        }
        const rawLoc = typeof sc?.location?.locationId === 'string' ? sc.location.locationId : null;
        if (rawLoc) {
          const m = rawLoc.match(UUID_ONLY);
          if (m) {
            refs.push({ type: 'location', id: m[0], role: 'backdrop', displayName: sc.location.locationName ?? null });
            v202Stats.locations += 1;
          } else {
            v202Stats.pending += 1;
          }
        }
        (sc as any).sceneAssets = refs;
        v202Stats.total += refs.length;
      }
      console.log('[briefing-deep-parse] v202_asset_registry_bound', {
        scenes: plan.scenes?.length ?? 0,
        ...v202Stats,
      });
    } catch (e: any) {
      console.warn('[briefing-deep-parse] v202 sceneAssets emit failed (non-fatal):', e?.message);
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
    // v175: explicit `.error` check + log — previously silent RLS / schema
    // failures caused the table to receive ZERO new rows since Jun 23.
    let version = 1;
    let persistError: string | null = null;
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
      const locResolutionForMeta = (plan as any)._locationResolution ?? null;
      const voicePoolForMeta = (plan as any)._voicePoolStats ?? null;
      try { delete (plan as any)._locationResolution; } catch { /* noop */ }
      try { delete (plan as any)._voicePoolStats; } catch { /* noop */ }
      const { error: insErr } = await supabase
        .from('composer_production_plans')
        .insert({
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
            model: passAModelUsed,
            passA_model: passAModelUsed,
            passB_model: passBModelUsed,
            passA_error: passAError,
            passB_error: passBError,
            passA_diagnostics: passADiagnostics,
            passB_diagnostics: passBDiagnostics,
            scene_count_corrected: sceneCountCorrection,
            catalog_version: CATALOG_VERSION,
            catalog_resolved: passCStats.resolved,
            catalog_unresolved: passCStats.unresolved,
            catalog_unresolved_samples: passCStats.unresolvedSamples,
            location_resolution: locResolutionForMeta,
            ensemble_repair: ensembleStats,
            strict_cast: strictCastStats,
            voice_pool_assignments: voicePoolForMeta,
          },
        });
      if (insErr) {
        persistError = `${(insErr as any).code ?? ''} ${insErr.message ?? insErr}`.trim();
        console.error('[briefing-deep-parse] persist returned error:', persistError);
      } else {
        console.log('[briefing-deep-parse] persisted plan', { projectId, version, userId });
      }
    } catch (e: any) {
      persistError = e?.message ?? String(e);
      console.error('[briefing-deep-parse] persist threw:', persistError);
    }

    return new Response(JSON.stringify({ plan, version, timings: { passA_ms: tA - t0, passB_ms: tB - tA, total_ms: Date.now() - t0 }, passA_error: passAError, passB_error: passBError, passA_model: passAModelUsed, passB_model: passBModelUsed, passA_diagnostics: passADiagnostics, passB_diagnostics: passBDiagnostics, ensemble_repair: ensembleStats, strict_cast: strictCastStats }), {

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
