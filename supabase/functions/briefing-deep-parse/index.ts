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
import { detectScriptTimingMode, type ScriptTimingInfo } from "./detectScriptTimingMode.ts";
import { enforceSoloCast } from "./enforceSoloCast.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

function parsePositiveSeconds(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
}

function parseSmallSceneCount(raw: string | undefined): number | null {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return null;
  const n = Number(value.replace(',', '.'));
  if (Number.isFinite(n) && n >= 1 && n <= 12) return Math.round(n);
  const words: Record<string, number> = {
    ein: 1, eine: 1, einen: 1, einer: 1, eines: 1, one: 1, single: 1,
    zwei: 2, two: 2,
    drei: 3, three: 3,
    vier: 4, four: 4,
    fünf: 5, fuenf: 5, five: 5,
    sechs: 6, six: 6,
    sieben: 7, seven: 7,
    acht: 8, eight: 8,
    neun: 9, nine: 9,
    zehn: 10, ten: 10,
    elf: 11, eleven: 11,
    zwölf: 12, zwoelf: 12, twelve: 12,
  };
  return words[value] ?? null;
}

function detectExplicitSceneContract(rawInput: string): { sceneCount?: number; continuousScene?: boolean; explicitSceneCount?: boolean } {
  const raw = String(rawInput ?? '');
  const continuousRe = /\b(?:(?:eine?|1|one|single)\s+(?:durchgehende|zusammenh[aä]ngende|kontinuierliche|ununterbrochene|continuous|uninterrupted|single|one[-\s]?take)\s+(?:szene|scene)|(?:szene|scene)\s*(?:[:=\-–—]\s*)?(?:eine?|1|one|single)\s+(?:durchgehende|zusammenh[aä]ngende|kontinuierliche|ununterbrochene|continuous|uninterrupted|single|one[-\s]?take)?\s*(?:szene|scene)?)\b/i;
  const field = raw.match(/(?:^|\n)\s*(?:szenen?|scenes?|scene\s*count|anzahl\s+szenen?)\s*[:=\-–—]\s*(?:ca\.?\s*)?([1-9]\d?|ein(?:e[rsn]?)?|one|single|zwei|two|drei|three|vier|four|f[üu]nf|fuenf|five|sechs|six|sieben|seven|acht|eight|neun|nine|zehn|ten|elf|eleven|zw[öo]lf|zwoelf|twelve)\b([^\n]*)/i);
  if (field) {
    const count = parseSmallSceneCount(field[1]);
    if (count) {
      const suffix = String(field[2] ?? '');
      return {
        sceneCount: count,
        continuousScene: count === 1 && (continuousRe.test(field[0]) || /\b(?:durchgehend|durchgehende|zusammenh[aä]ngend|kontinuierlich|ununterbrochen|continuous|uninterrupted|one[-\s]?take|single)\b/i.test(suffix)),
        explicitSceneCount: true,
      };
    }
  }
  const countBeforeUnit = raw.match(/(?:^|[^\d])([1-9]\d?)\s*(?:x|×)?\s*(?:szenen|scenes|shots?)\b/i);
  const count = countBeforeUnit ? Number(countBeforeUnit[1]) : undefined;
  if (count && count >= 1 && count <= 12) {
    return { sceneCount: count, continuousScene: count === 1 && continuousRe.test(raw), explicitSceneCount: true };
  }
  if (continuousRe.test(raw)) return { sceneCount: 1, continuousScene: true, explicitSceneCount: true };
  return {};
}

function detectExplicitBriefingTiming(rawInput: string): { durationSec: number; sceneCount?: number; continuousScene?: boolean; explicitSceneCount?: boolean; source: 'explicit-total' | 'scene-math' | 'time-windows' } | null {
  const raw = String(rawInput ?? '').split(/\n\s*##\s+Project\b/i)[0].trim();
  if (!raw) return null;

  const sceneContract = detectExplicitSceneContract(raw);
  const sceneCount = sceneContract.sceneCount;

  const explicitPatterns = [
    /(?:gesamt\s*dauer|gesamtdauer|gesamt\s*länge|gesamtlaenge|gesamtlänge|total\s*duration|filmdauer|film\s*dauer|video\s*dauer|spot\s*dauer|laufzeit)(?:\s+(?:des|der|vom|für|fuer|of)\s+(?:videos?|films?|spots?|ads?))?\s*[:=\-–—]?\s*(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b/i,
    /(?:^|\n)\s*(?:länge|laenge|film[- ]?länge|film[- ]?laenge|video[- ]?länge|video[- ]?laenge|spot[- ]?länge|spot[- ]?laenge)\s*[:=\-–—]\s*(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b/i,
    /(?:^|\n|[.!?]\s+)[^\n]{0,60}?\b(?:in|within|binnen)\s+(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b[^\n]{0,120}?\b(?:zeigen|show|demonstrieren|demonstrate|erzählen|erzaehlen|video|film|spot|commercial)\b/i,
    /\b(?:film|video|spot|werbevideo|werbespot|werbefilm|imagefilm|ad)\b[^\n]{0,80}?\b(\d+(?:[,.]\d+)?)\s*(?:sekunden|seconds|secs?|s)\b/i,
  ];
  for (const re of explicitPatterns) {
    const seconds = parsePositiveSeconds(raw.match(re)?.[1]);
    if (seconds && seconds >= 3) return { durationSec: seconds, sceneCount, continuousScene: sceneContract.continuousScene, explicitSceneCount: sceneContract.explicitSceneCount, source: 'explicit-total' };
  }

  const compact = raw.match(/(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b\s*(?:[\/|,;·\-–—]|\(|\[)?\s*([1-9]\d?)\s*(?:szenen|scenes|shots?)\b/i);
  const compactSeconds = parsePositiveSeconds(compact?.[1]);
  if (compactSeconds && compactSeconds >= 3) return { durationSec: compactSeconds, sceneCount: Number(compact?.[2] ?? sceneCount), continuousScene: sceneContract.continuousScene, explicitSceneCount: sceneContract.explicitSceneCount || Boolean(compact?.[2]), source: 'explicit-total' };

  const windowRe = /(?:^|[^\d])(\d+(?:[,.]\d+)?)\s*(s|sec|sek\.?|sekunden|seconds)?\s*[–—-]\s*(\d+(?:[,.]\d+)?)\s*(s|sec|sek\.?|sekunden|seconds)?\b/gi;
  const ageTailRe = /^\s*(?:jahre|jahren|jährig|jaehrig|jährige|jaehrige|years?|yrs?|y\.o\.?)\b/i;
  const timeAnchorRe = /(?:zeit|timing|sek|sekunden|second|dauer|duration|shot|szene|scene|hook|cta|frame|beat|marker|clip)/i;
  let maxEnd = 0;
  let windows = 0;
  for (const m of raw.matchAll(windowRe)) {
    const start = parsePositiveSeconds(m[1]);
    const end = parsePositiveSeconds(m[3]);
    if (start === null || end === null || end <= start || end > 600) continue;
    const idx = m.index ?? 0;
    const after = raw.slice(idx + m[0].length, idx + m[0].length + 20);
    if (ageTailRe.test(after)) continue;
    const hasUnit = Boolean(m[2] || m[4]);
    if (!hasUnit) {
      const lineStart = raw.lastIndexOf('\n', idx) + 1;
      const lineEnd = raw.indexOf('\n', idx);
      const line = raw.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      if (!timeAnchorRe.test(line)) continue;
    }
    maxEnd = Math.max(maxEnd, end);
    windows += 1;
  }
  if (windows >= 2 && maxEnd >= 3) return { durationSec: Math.round(maxEnd * 10) / 10, sceneCount: sceneCount ?? windows, continuousScene: sceneContract.continuousScene, explicitSceneCount: sceneContract.explicitSceneCount, source: 'time-windows' };

  const sceneMath = raw.match(/([1-9]\d?)\s*(?:szenen|scenes|shots?)\b[^\n]{0,60}?(?:à|a|je|each|x|×)\s*(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b/i);
  const perScene = parsePositiveSeconds(sceneMath?.[2]);
  if (sceneMath && perScene) {
    const count = Number(sceneMath[1]);
    return { durationSec: Math.round(count * perScene * 10) / 10, sceneCount: count, continuousScene: sceneContract.continuousScene, explicitSceneCount: true, source: 'scene-math' };
  }
  return null;
}

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
                properties: {
                  mentionKey: { type: 'string' },
                  description: { type: 'string', description: 'Free-text setting description in ENGLISH when the briefing describes a location NOT already in the library (e.g. "Split-screen office / home office at dawn"). Keep it cinematic and concrete: place, time of day, mood, key props. Leave empty when the briefing references a library mention verbatim.' },
                },
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

ENSEMBLE CAST GUARANTEE (SOFT — respect the script): If the "## Cast" section
contains 2–4 selected avatars, prefer at least ONE ensemble scene where ALL
selected cast members share the frame. BUT: NEVER force ensemble on a scene
whose script/dialogTurns explicitly names a SINGLE speaker or a specific subset
— that scene stays solo/duet. Only expand scenes whose speaker is undefined or
generic ("group", "team", "everyone"). Ensemble scenes must be wide/medium-wide
group shots with anchorPromptEN naming every cast member.

TIMING FIDELITY (HARD): If the briefing states explicit per-scene durations
("Scene 1 – 3s", "Sprecher 1 (0–4s)", "3s + 4s + 4s + 4s = 15s", "15s total"),
you MUST emit EXACTLY that many scenes with those exact durationSec values.
Do NOT redistribute to a different scene count. Total durationSec across all
scenes MUST equal the briefing's stated total (±1s tolerance).

SHOT-STRUCTURE PRESERVATION (HARD): If the briefing enumerates shots or beats
(1A/1B, "Split-screen", "Endcard", "S01…S04"), emit ONE scene per marker in
that exact order. Do not merge two beats into a single scene, do not skip a
beat, do not reorder. Missing beats = broken output.

OUTFIT AUTO-MATCH: For every cast slot on every scene, if the briefing does
NOT name a specific library outfit look, set resolvedCast[i].outfitPreset to
the best-fitting id from this fixed list based on briefing tone/scenario:
  "business-formal", "business-casual", "smart-casual", "streetwear",
  "creative-modern", "gym-athleisure", "outdoor-casual", "evening-elegant",
  "weekend-relaxed", "tech-founder".
Keyword hints: suit/anzug→business-formal; office/büro→business-casual;
sneaker/casual→smart-casual; hoodie/urban→streetwear; designer/minimal→
creative-modern; gym/sport→gym-athleisure; outdoor/hike→outdoor-casual;
evening/gala→evening-elegant; weekend/relaxed→weekend-relaxed; founder/
startup/saas/tech→tech-founder. Default when unclear: "smart-casual".

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
                    outfitPreset: { type: 'string', nullable: true },
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
                  description: { type: 'string', description: 'Free-text setting description (ENGLISH). Pass through from Pass A verbatim when no library match exists so the i2v prompt can render the backdrop as-briefed.' },
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
    for (const f of ['characterId','characterName','voiceId','voiceName','shotType','outfit','outfitLookId','outfitPreset','referenceImageUrl']) {
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
      const desc = typeof r2?.description === 'string' && r2.description.trim()
        ? r2.description.trim().slice(0, 600)
        : (typeof s.location?.description === 'string' && s.location.description.trim()
            ? s.location.description.trim().slice(0, 600)
            : undefined);
      return stripUndef({
        mentionKey: s.location.mentionKey,
        locationId: typeof r2?.locationId === 'string' ? r2.locationId : null,
        locationName: r2?.locationName ?? String(s.location.mentionKey ?? '').replace(/^@/, ''),
        description: desc,
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
  // v220 — no longer short-circuit when some briefed characters lack UUIDs.
  // We still drop hallucinated speakers as long as we have at least one
  // resolved UUID as the "known good" allowlist reference.
  const resolvedIds = required.map((r) => r.characterId).filter(Boolean);
  if (resolvedIds.length === 0) return { dropped: 0, backfilled: 0 };
  const idSet = new Set(resolvedIds.map((id: any) => String(id).toLowerCase()));
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

function mergePlanScenesToSingleContinuousScene(
  planLike: any,
  targetDurationSec: number | null,
  requiredCast: any[] = []
): { merged: boolean; from: number; to: number; backfilled: number } {
  const scenes = Array.isArray(planLike?.scenes) ? planLike.scenes : [];
  const keyOfCast = (c: any) =>
    String(c?.characterId ?? c?.mentionKey ?? c?.characterName ?? '').toLowerCase();

  // Helper: deterministically backfill briefed cast into a single scene.
  const backfillCast = (castArr: any[]): { cast: any[]; backfilled: number } => {
    const present = new Set(castArr.map(keyOfCast).filter(Boolean));
    let backfilled = 0;
    for (const req of requiredCast) {
      const k = keyOfCast(req);
      if (!k || present.has(k)) continue;
      if (castArr.length >= 4) break;
      castArr.push({ ...req, shotType: 'full' });
      present.add(k);
      backfilled += 1;
    }
    return { cast: castArr, backfilled };
  };

  if (scenes.length <= 1) {
    let backfilled = 0;
    if (scenes.length === 1) {
      if (targetDurationSec && Number.isFinite(targetDurationSec)) {
        scenes[0].durationSec = targetDurationSec;
        if (!planLike.project) planLike.project = {};
        planLike.project.totalDurationSec = targetDurationSec;
      }
      if (requiredCast.length >= 2) {
        const cast = Array.isArray(scenes[0].cast) ? [...scenes[0].cast] : [];
        const res = backfillCast(cast);
        scenes[0].cast = res.cast;
        backfilled = res.backfilled;
      }
    }
    return { merged: false, from: scenes.length, to: scenes.length, backfilled };
  }

  const base = { ...(scenes[0] ?? {}) };
  const castByKey = new Map<string, any>();
  const turns: any[] = [];
  let voiceText = '';
  let overlay = base.textOverlay ?? null;
  let location = base.location ?? null;
  let anchorPromptEN = String(base.anchorPromptEN ?? '').trim();

  for (const sc of scenes) {
    for (const c of Array.isArray(sc?.cast) ? sc.cast : []) {
      const key = keyOfCast(c);
      if (key && !castByKey.has(key)) castByKey.set(key, c);
    }
    if (Array.isArray(sc?.dialogTurns) && sc.dialogTurns.length > 0) {
      for (const t of sc.dialogTurns) {
        const text = String(t?.text ?? '').trim();
        if (text) turns.push({ ...t, text });
      }
    } else if (sc?.voiceover?.text) {
      const text = String(sc.voiceover.text).trim();
      if (text) voiceText = voiceText ? `${voiceText} ${text}` : text;
    }
    if (!overlay && sc?.textOverlay) overlay = sc.textOverlay;
    if (!location && sc?.location) location = sc.location;
    const prompt = String(sc?.anchorPromptEN ?? '').trim();
    if (prompt && !anchorPromptEN.includes(prompt)) {
      anchorPromptEN = anchorPromptEN ? `${anchorPromptEN}\n${prompt}` : prompt;
    }
  }

  const duration = targetDurationSec && Number.isFinite(targetDurationSec)
    ? targetDurationSec
    : scenes.reduce((a: number, s: any) => a + (Number(s?.durationSec) || 0), 0) || 15;

  // v216 — deterministic ensemble backfill for continuous scenes.
  const mergedCast = Array.from(castByKey.values());
  const res = backfillCast(mergedCast);

  planLike.scenes = [{
    ...base,
    index: 1,
    label: base.label ?? 'Durchgehende Szene',
    durationSec: Math.round(duration * 10) / 10,
    lipSync: base.lipSync === true || turns.length > 0 || res.cast.length > 0,
    cast: res.cast,
    location: location ?? base.location,
    anchorPromptEN: anchorPromptEN || base.anchorPromptEN,
    dialogTurns: turns.length ? turns : base.dialogTurns,
    voiceover: turns.length ? undefined : (voiceText ? { ...(base.voiceover ?? {}), text: voiceText } : base.voiceover),
    textOverlay: overlay ?? base.textOverlay,
  }];
  if (!planLike.project) planLike.project = {};
  planLike.project.totalDurationSec = Math.round(duration * 10) / 10;
  return { merged: true, from: scenes.length, to: 1, backfilled: res.backfilled };
}

/**
 * v218 — Continuous-Scene Dialog-Turn Ensemble Split.
 *
 * When the briefing declares a single continuous scene with 2+ briefed
 * speakers but the LLM collapses everything into a single dialogTurn (or a
 * plain voiceover), split the spoken text into N chunks — one per briefed
 * cast member — so the client can bind voices per speaker instead of
 * assigning the whole script to a single character.
 *
 * Strategy:
 *   1. Only fires for scenes.length === 1 with `continuousScene` contract.
 *   2. Skip when unique speakers in dialogTurns already >= requiredCast.length.
 *   3. Corpus = joined dialogTurn texts || voiceover.text.
 *   4. Split by sentence boundaries; fall back to even word split when
 *      fewer sentences than speakers.
 *   5. Emit N dialogTurns keyed to the briefed cast in order and bind the
 *      canonical UUID directly (bindTurnSpeakerIds runs after this pass
 *      and will keep them intact).
 */
function ensureContinuousSceneDialogTurns(
  plan: any,
  requiredCast: any[],
  continuousScene: boolean,
): { split: boolean; turns: number; source: 'dialog' | 'voiceover' | 'placeholder' } {
  if (!continuousScene) return { split: false, turns: 0, source: 'dialog' };
  const scenes = Array.isArray(plan?.scenes) ? plan.scenes : [];
  if (scenes.length !== 1) return { split: false, turns: 0, source: 'dialog' };
  if (!Array.isArray(requiredCast) || requiredCast.length < 2) {
    return { split: false, turns: 0, source: 'dialog' };
  }
  const sc = scenes[0];
  const existingTurns = Array.isArray(sc?.dialogTurns) ? sc.dialogTurns : [];
  const uniqSpeakers = new Set(
    existingTurns
      .map((t: any) =>
        String(t?.speakerCharacterId ?? t?.speakerMentionKey ?? '').toLowerCase(),
      )
      .filter(Boolean),
  );
  if (uniqSpeakers.size >= requiredCast.length) {
    return { split: false, turns: existingTurns.length, source: 'dialog' };
  }

  // Build spoken corpus.
  let corpus = '';
  let source: 'dialog' | 'voiceover' | 'placeholder' = 'dialog';
  if (existingTurns.length > 0) {
    corpus = existingTurns
      .map((t: any) => String(t?.text ?? '').trim())
      .filter(Boolean)
      .join(' ');
  }
  if (!corpus && sc?.voiceover?.text) {
    corpus = String(sc.voiceover.text).trim();
    source = 'voiceover';
  }

  const slugify = (v: string) =>
    String(v ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const mentionFor = (c: any, i: number): string => {
    const raw = String(c?.mentionKey ?? '').trim();
    if (raw) return raw.startsWith('@') ? raw : `@${raw}`;
    const slug = slugify(c?.characterName ?? '') || `sprecher-${i + 1}`;
    return `@${slug}`;
  };

  const N = requiredCast.length;

  if (!corpus) {
    // No spoken text yet — emit empty per-speaker placeholders so the user
    // can fill each turn in the UI (rather than one speaker owning nothing).
    sc.dialogTurns = requiredCast.map((c: any, i: number) => ({
      speakerMentionKey: mentionFor(c, i),
      speakerCharacterId: c?.characterId ?? null,
      text: '',
    }));
    return { split: true, turns: N, source: 'placeholder' };
  }

  // Split into N chunks: sentence-boundary preferred, word-fallback.
  const sentences = corpus
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  if (sentences.length >= N) {
    const per = Math.ceil(sentences.length / N);
    for (let i = 0; i < N; i++) {
      chunks.push(sentences.slice(i * per, i * per + per).join(' ').trim());
    }
  } else {
    const words = corpus.split(/\s+/).filter(Boolean);
    const per = Math.max(1, Math.ceil(words.length / N));
    for (let i = 0; i < N; i++) {
      chunks.push(words.slice(i * per, i * per + per).join(' ').trim());
    }
  }
  while (chunks.length < N) chunks.push('');

  sc.dialogTurns = requiredCast.map((c: any, i: number) => ({
    speakerMentionKey: mentionFor(c, i),
    speakerCharacterId: c?.characterId ?? null,
    text: chunks[i] ?? '',
  }));
  if (sc.voiceover) sc.voiceover.text = '';
  return { split: true, turns: N, source };

function applyContinuousScriptTurns(planLike: any, scriptTiming: ScriptTimingInfo, targetDurationSec: number | null) {
  if (!Array.isArray(planLike?.scenes) || planLike.scenes.length !== 1) return { applied: false, turns: 0 };
  const sc = planLike.scenes[0];
  const allTurns: any[] = [];
  for (const shot of scriptTiming?.shots ?? []) {
    if (Array.isArray(shot.dialogTurns) && shot.dialogTurns.length > 0) {
      for (const t of shot.dialogTurns) {
        const text = String(t?.text ?? '').trim();
        if (text) allTurns.push({ speakerMentionKey: `@${String(t.speakerLabel ?? 'sprecher').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sprecher'}`, text });
      }
    } else if (shot.text && shot.speakerLabel && shot.sceneKind !== 'endcard') {
      allTurns.push({ speakerMentionKey: `@${String(shot.speakerLabel).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sprecher'}`, text: String(shot.text).trim() });
    } else if (shot.sceneKind === 'endcard' && shot.overlayText && !sc.textOverlay) {
      sc.textOverlay = { text: shot.overlayText, position: 'center', animation: 'fade-in' };
    }
  }
  if (allTurns.length > 0) {
    sc.dialogTurns = allTurns;
    if (sc.voiceover) sc.voiceover.text = '';
  }
  if (targetDurationSec && Number.isFinite(targetDurationSec)) {
    sc.durationSec = targetDurationSec;
    if (!planLike.project) planLike.project = {};
    planLike.project.totalDurationSec = targetDurationSec;
  }
  return { applied: allTurns.length > 0, turns: allTurns.length };
}

/**
 * v217 — Bind each dialogTurn to a canonical Charakter-UUID from the scene
 * cast. **ID-only**: no name matching, no slug heuristics, no fuzzy compare.
 *
 * Strategy per scene:
 *   1. Skip when no turns or no cast with UUIDs.
 *   2. If turn.speakerCharacterId already set and points to a cast UUID → keep.
 *   3. Positional bind when # UUID-cast-slots >= # unique turn speakers
 *      (turn appearance order → cast[] index in briefing order).
 *   4. Else leave null (diagnostic).
 */
function bindTurnSpeakerIds(planLike: any): { total: number; byCastIndex: number; alreadySet: number; unresolved: number } {
  const stats = { total: 0, byCastIndex: 0, alreadySet: 0, unresolved: 0 };
  const scenes = Array.isArray(planLike?.scenes) ? planLike.scenes : [];
  const UUID_RE_INNER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const sc of scenes) {
    const turns = Array.isArray(sc?.dialogTurns) ? sc.dialogTurns : [];
    if (turns.length === 0) continue;
    const cast = Array.isArray(sc?.cast) ? sc.cast : [];
    const uuidCast: string[] = cast
      .map((c: any) => (typeof c?.characterId === 'string' && UUID_RE_INNER.test(c.characterId) ? c.characterId : null))
      .filter((x: string | null): x is string => !!x);
    const uuidCastSet = new Set(uuidCast.map((id) => id.toLowerCase()));

    // Deterministic order in which unique speaker slugs appear in turns.
    const orderedSlugs: string[] = [];
    const seenSlug = new Set<string>();
    for (const t of turns) {
      const slug = String(t?.speakerMentionKey ?? '').toLowerCase().replace(/^@/, '');
      if (!slug || seenSlug.has(slug)) continue;
      seenSlug.add(slug);
      orderedSlugs.push(slug);
    }

    // Build slug → uuid map by position when possible.
    const slugToUuid = new Map<string, string>();
    if (uuidCast.length >= orderedSlugs.length && orderedSlugs.length > 0) {
      for (let i = 0; i < orderedSlugs.length; i += 1) {
        slugToUuid.set(orderedSlugs[i], uuidCast[i]);
      }
    }

    for (const t of turns) {
      stats.total += 1;
      const existing = typeof t?.speakerCharacterId === 'string' ? t.speakerCharacterId : null;
      if (existing && UUID_RE_INNER.test(existing) && uuidCastSet.has(existing.toLowerCase())) {
        stats.alreadySet += 1;
        continue;
      }
      const slug = String(t?.speakerMentionKey ?? '').toLowerCase().replace(/^@/, '');
      const mapped = slug ? slugToUuid.get(slug) : undefined;
      if (mapped) {
        t.speakerCharacterId = mapped;
        stats.byCastIndex += 1;
      } else {
        t.speakerCharacterId = null;
        stats.unresolved += 1;
      }
    }
  }
  return stats;
}

/**
 * v213 — Extract the "## Verbatim Script" block emitted by the client
 * when Mode: LITERAL is active. Returns the script body (without the fence)
 * along with the parsed Speaker Map (script label → @mention).
 */
function extractVerbatimScript(briefing: string): {
  present: boolean;
  script: string;
  speakerMap: Map<string, string>;
} {
  const speakerMap = new Map<string, string>();
  const src = String(briefing ?? '');
  // Speaker Map block
  const smMatch = src.match(/##\s+Speaker\s+Map[^\n]*\n([\s\S]*?)(?:\n##\s+|\n```|$)/i);
  if (smMatch) {
    for (const line of smMatch[1].split('\n')) {
      const m = line.match(/^\s*-\s*(.+?)\s*(?:→|->|=>)\s*@([a-z0-9][a-z0-9-_]{1,47})/i);
      if (m) {
        speakerMap.set(m[1].trim().toLowerCase(), `@${m[2].toLowerCase()}`);
      }
    }
  }
  // Verbatim Script block — either ```-fenced or plain until next ## header
  const vsFenced = src.match(/##\s+Verbatim\s+Script[^\n]*\n```[a-z]*\n([\s\S]*?)\n```/i);
  const vsPlain = vsFenced ? null : src.match(/##\s+Verbatim\s+Script[^\n]*\n([\s\S]*?)(?:\n##\s+|$)/i);
  const script = (vsFenced?.[1] ?? vsPlain?.[1] ?? '').trim();
  return { present: script.length > 0, script, speakerMap };
}

/**
 * v213 — Split a verbatim script into scene blocks keyed by SZENE/SCENE N
 * markers. Falls back to a single virtual scene when no markers exist.
 */
function splitScriptIntoScenes(script: string): Array<{ index: number; body: string }> {
  const src = String(script ?? '');
  const markerRe = /(?:^|\n)\s*(?:szene|scene|shot)\s*(\d{1,2})\b[^\n]*\n?/gi;
  const marks: Array<{ index: number; start: number; end: number }> = [];
  for (const m of src.matchAll(markerRe)) {
    const idx = parseInt(m[1], 10);
    if (!Number.isFinite(idx)) continue;
    const start = (m.index ?? 0) + m[0].length;
    marks.push({ index: idx, start, end: src.length });
  }
  if (marks.length === 0) return [{ index: 1, body: src.trim() }];
  for (let i = 0; i < marks.length - 1; i++) marks[i].end = marks[i + 1].start;
  return marks.map((m) => ({ index: m.index, body: src.slice(m.start, m.end).trim() }));
}

/**
 * v213 — Extract `NAME: text` dialog lines from a verbatim script block.
 */
function extractScriptDialogTurns(sceneBody: string): Array<{ label: string; text: string }> {
  const lines = String(sceneBody ?? '').split('\n');
  const turns: Array<{ label: string; text: string }> = [];
  const speakerRe = /^\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-\.\s]{1,40}?)\s*[:—-]\s+(.+)$/;
  let current: { label: string; text: string } | null = null;
  for (const line of lines) {
    const m = line.match(speakerRe);
    if (m) {
      const label = m[1].trim();
      if (/^(szene|scene|shot|kamera|framing|mood|note|tone|dialog|dialogue|voiceover|vo|hook|reveal|cta|pain|proof|beat)$/i.test(label)) continue;
      if (current) turns.push(current);
      current = { label, text: m[2].trim() };
    } else if (current && line.trim()) {
      // Continuation of previous speaker
      current.text = `${current.text} ${line.trim()}`;
    }
  }
  if (current) turns.push(current);
  return turns;
}

/**
 * v213 — Enforce briefing fidelity in LITERAL mode. Compares the parsed
 * plan against the verbatim script and repairs mismatches:
 *   1. Dialog text mismatch → overwrite plan text with script text.
 *   2. Speaker label unmapped → assign speakerMentionKey via speakerMap.
 * Non-destructive: only touches scenes whose index appears in the script.
 * Returns telemetry so the UI can surface a "Fidelity" chip.
 */
function enforceBriefingFidelity(
  plan: any,
  briefing: string,
): { mode: 'literal' | 'auto'; repairedTexts: number; repairedSpeakers: number; scenesMatched: number; scenesInScript: number } {
  const { present, script, speakerMap } = extractVerbatimScript(briefing);
  if (!present) return { mode: 'auto', repairedTexts: 0, repairedSpeakers: 0, scenesMatched: 0, scenesInScript: 0 };
  const sceneBlocks = splitScriptIntoScenes(script);
  const byIndex = new Map(sceneBlocks.map((s) => [s.index, s]));
  let repairedTexts = 0;
  let repairedSpeakers = 0;
  let scenesMatched = 0;

  const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[\s\.,!\?—\-–:;"'`«»„"'()\[\]]+/g, '');

  for (const sc of Array.isArray(plan?.scenes) ? plan.scenes : []) {
    const block = byIndex.get(Number(sc?.index));
    if (!block) continue;
    scenesMatched += 1;
    const scriptTurns = extractScriptDialogTurns(block.body);
    if (scriptTurns.length === 0) continue;

    // Ensure dialogTurns matches scriptTurns 1:1 in count/order.
    if (!Array.isArray(sc.dialogTurns) || sc.dialogTurns.length !== scriptTurns.length) {
      // G5 — Sanitize repair count. Only count the DELTA vs. what the LLM
      // already produced; do not bill users for the initial dialog fill.
      const prev = Array.isArray(sc.dialogTurns) ? sc.dialogTurns : [];
      const textDelta = Math.max(0, scriptTurns.length - prev.length);
      let speakerDelta = 0;
      for (const t of scriptTurns) {
        const expected = speakerMap.get(t.label.toLowerCase());
        const guess = `@${t.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        if (expected && expected !== guess) speakerDelta += 1;
      }
      sc.dialogTurns = scriptTurns.map((t) => ({
        speakerMentionKey: speakerMap.get(t.label.toLowerCase()) ?? `@${t.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        text: t.text,
      }));
      repairedTexts += textDelta;
      repairedSpeakers += speakerDelta;
      continue;
    }

    // Same count → repair in place per turn.
    for (let i = 0; i < scriptTurns.length; i++) {
      const src = scriptTurns[i];
      const dst = sc.dialogTurns[i] ?? (sc.dialogTurns[i] = {});
      if (norm(dst.text) !== norm(src.text)) {
        dst.text = src.text;
        repairedTexts += 1;
      }
      const expected = speakerMap.get(src.label.toLowerCase());
      if (expected && dst.speakerMentionKey !== expected) {
        dst.speakerMentionKey = expected;
        repairedSpeakers += 1;
      }
    }
  }

  return { mode: 'literal', repairedTexts, repairedSpeakers, scenesMatched, scenesInScript: sceneBlocks.length };
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

  // v214 — scenes with explicit dialogTurns naming specific speakers must NOT
  // be overwritten by ensemble injection. That's a solo/duet shot from the
  // script, not a group moment.
  const isExplicitlyScripted = (sc: any): boolean => {
    // J6 — never inject ensemble into showcase / endcard scenes.
    const kind = String(sc?.sceneKind ?? '').toLowerCase();
    if (kind === 'endcard' || kind === 'ensemble_showcase') return true;
    const turns = Array.isArray(sc?.dialogTurns) ? sc.dialogTurns : [];
    if (turns.length === 0) return false;
    const speakers = new Set(turns.map((t: any) => normalizeMention(String(t?.speakerMentionKey ?? ''))).filter(Boolean));
    return speakers.size >= 1;
  };

  // C-1 fix — build a new scenes array; do NOT mutate input objects in place.
  const nextScenes = scenes.slice();
  const toRepair = new Set<number>();
  {
    const ordered = order.filter((idx) => scenes[idx] && !hasAll(scenes[idx]) && !isExplicitlyScripted(scenes[idx]));
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

    // v213 — LITERAL-mode override: when the client detected an explicit
    // script (speaker lines / scene markers) and set `Mode: LITERAL`, we
    // prepend a hard directive so Pass A reproduces the script 1:1 instead
    // of running AUTO-DIRECTOR synthesis. Also honors the ## Speaker Map
    // block if present, mapping script labels → briefed @-mentions.
    const literalMode = /^Mode:\s*LITERAL\b/mi.test(briefing);
    const LITERAL_LOCK = literalMode ? `
═══════════════════════════════════════════════════════════════════════════
LITERAL MODE — HARD OVERRIDE (top priority over AUTO-DIRECTOR)
═══════════════════════════════════════════════════════════════════════════
The user provided an explicit screenplay via "## Verbatim Script".
YOU MUST:
  • Reproduce dialogue text 1:1 (word-for-word) from the script — never rewrite,
    summarize, paraphrase, translate, or trim spoken lines.
  • Never invent speaker names. Every dialogTurns[].speakerMentionKey MUST
    resolve via the "## Speaker Map" section to an @-mention listed in
    "## Cast". If a mapping is missing, use the closest briefed cast member
    (by role/context), never a made-up name like "George" or "Roger".
  • Never reassign a line to a different speaker than the script labels.
  • Emit EXACTLY one scene per "SZENE N" / "SCENE N" marker in the script.
    Do NOT merge, split, add, or drop scenes.
  • Fill visual metadata (framing, angle, movement, lighting, anchorPromptEN)
    freely — that is where you add value. But NEVER change the spoken words
    or the speaker assignments.
═══════════════════════════════════════════════════════════════════════════
` : '';

    // G1 — Script-Timing classification. Determines whether the script or
    // the board's totalDurationSec wins. See detectScriptTimingMode.ts.
    let scriptTiming: ScriptTimingInfo;
    try {
      scriptTiming = detectScriptTimingMode(briefing);
    } catch (e: any) {
      console.warn('[briefing-deep-parse] script-timing detect failed (non-fatal):', e?.message);
      scriptTiming = { mode: 'FREETEXT', source: 'none', shots: [], computedTotalSec: null };
    }
    const explicitBriefingTiming = detectExplicitBriefingTiming(briefing);
    const continuousSceneLock = !!explicitBriefingTiming?.continuousScene
      && explicitBriefingTiming.sceneCount === 1
      && scriptTiming.mode === 'SHOT_MARKERS';
    const SCRIPT_TIMING_LOCK = scriptTiming.mode === 'SHOT_MARKERS'
      ? (continuousSceneLock ? `
═══════════════════════════════════════════════════════════════════════════
CONTINUOUS-SCENE SCRIPT LOCK — HARD OVERRIDE
═══════════════════════════════════════════════════════════════════════════
The briefing explicitly requests ONE continuous scene (${explicitBriefingTiming.durationSec}s).
The ${scriptTiming.shots.length} timing/speaker markers are INTERNAL dialog
turns/beat cues, NOT separate scenes.
YOU MUST:
  • Emit EXACTLY 1 scene with durationSec=${explicitBriefingTiming.durationSec}.
  • Put all spoken speaker lines into that scene's dialogTurns in order.
  • Use internal timing windows only as timing hints; do NOT create one scene
    per speaker, time window, Shot 1A/1B, Endcard, or beat.
  • Keep all selected speakers/cast available in that one scene; do not invent
    extra people or voices.
═══════════════════════════════════════════════════════════════════════════
` : `
═══════════════════════════════════════════════════════════════════════════
SCRIPT-TIMING LOCK — HARD OVERRIDE (script wins over board settings)
═══════════════════════════════════════════════════════════════════════════
The briefing contains EXACTLY ${scriptTiming.shots.length} explicit shot
markers (SZENE/SCENE/SHOT N or numbered Sprecher blocks with time windows).
YOU MUST:
  • Emit EXACTLY ${scriptTiming.shots.length} scenes — one per shot marker,
    in the same order. Merging or splitting is forbidden.
  • IGNORE any "Gesamtdauer" / "totalDurationSec" hint from the ## Project
    section. The script's per-shot durations are the source of truth.
  • When a shot names a single speaker (e.g. "Sprecher 2:"), the scene's
    cast MUST be exactly that speaker — do not add other briefed cast
    members. Only shots explicitly showing multiple speakers get an
    ensemble cast.
═══════════════════════════════════════════════════════════════════════════
`) : '';


    const passAPromise = callGatewayChain(
      {
        system: LANGUAGE_LOCK + '\n' + LITERAL_LOCK + '\n' + SCRIPT_TIMING_LOCK + '\n' + SYSTEM_PASS_A,
        tool: TOOL_PASS_A,
        user: `BRIEFING (source language: ${languageDisplay}):\n\n${briefing}`,
      },
      [
        // G-1: bumped primary flash retries 1 → 2. Total attempts on the
        // primary model = 3 before falling back to Pro; kills most flaky
        // 5xx / partial-JSON runs before the user ever sees a fallback plan.
        { model: 'google/gemini-2.5-flash',      timeoutMs: 35_000, maxTokens: 6000, retries: 2 },
        { model: 'google/gemini-2.5-pro',        timeoutMs: 60_000, maxTokens: 6000, retries: 1 },
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
      let detected = maxMarker >= 2 ? maxMarker : (numFromWord ?? (listCount >= 3 ? listCount : null));

      // G1/G2 — Script-Timing takes precedence only when the briefing did NOT
      // explicitly lock a different top-level scene count. In a brief like
      // "Szenen: 1 durchgehende Szene", timing windows / speaker markers are
      // dialog turns inside that one scene, not separate scenes.
      if (explicitBriefingTiming?.explicitSceneCount && explicitBriefingTiming.sceneCount) {
        detected = explicitBriefingTiming.sceneCount;
      }
      const useScriptTiming = scriptTiming.mode === 'SHOT_MARKERS'
        && scriptTiming.shots.length >= 2
        && !(explicitBriefingTiming?.explicitSceneCount && explicitBriefingTiming.sceneCount && explicitBriefingTiming.sceneCount !== scriptTiming.shots.length);
      if (useScriptTiming) detected = scriptTiming.shots.length;

      if (detected && Array.isArray(manifest?.scenes)) {
        const got = manifest.scenes.length;
        if (detected === 1 && explicitBriefingTiming?.continuousScene && got > 1) {
          const requiredCastForMerge = extractSelectedCastFromBriefing(briefing, characters);
          const mergeStats = mergePlanScenesToSingleContinuousScene(manifest, explicitBriefingTiming.durationSec, requiredCastForMerge);
          applyContinuousScriptTurns(manifest, scriptTiming, explicitBriefingTiming.durationSec);
          sceneCountCorrection = { detected, gemini: got };
          console.log('[briefing-deep-parse] continuous_scene_merged', mergeStats);
        }
        if (manifest.scenes.length !== detected) {
          const total = Number(manifest?.project?.totalDurationSec) || (got * 5);
          const perScene = Math.max(2, Math.min(30, Math.round(total / detected)));
          if (manifest.scenes.length > detected) {
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
              if (!padded.cast) delete padded.cast;
              if (!padded.location) delete padded.location;
              if (!padded.shotDirector) delete padded.shotDirector;
              manifest.scenes.push(padded);
            }
          }
          // Redistribute durations + reindex. When script-timing is active,
          // use per-shot durations (variable); otherwise even split.
          if (useScriptTiming) {
            const shots = scriptTiming.shots;
            manifest.scenes = manifest.scenes.map((s: any, i: number) => ({
              ...s,
              index: i + 1,
              durationSec: shots[i]?.durationSec ?? perScene,
            }));
            const sum = manifest.scenes.reduce((a: number, s: any) => a + (Number(s.durationSec) || 0), 0);
            if (!manifest.project) manifest.project = {};
            manifest.project.totalDurationSec = sum || perScene * detected;
          } else {
            manifest.scenes = manifest.scenes.map((s: any, i: number) => ({
              ...s,
              index: i + 1,
              durationSec: perScene,
            }));
            if (!manifest.project) manifest.project = {};
            manifest.project.totalDurationSec = perScene * detected;
          }
          sceneCountCorrection = { detected, gemini: got };
          console.log('[briefing-deep-parse] scene_count_corrected', { detected, gemini: got, perScene, scriptWins: useScriptTiming });
        } else if (useScriptTiming) {
          // Count matches — still align per-shot durations from the script.
          const shots = scriptTiming.shots;
          const allTimed = shots.every((s) => s.durationSec != null);
          if (allTimed) {
            manifest.scenes = manifest.scenes.map((s: any, i: number) => ({
              ...s,
              durationSec: shots[i]?.durationSec ?? s.durationSec,
            }));
            const sum = manifest.scenes.reduce((a: number, s: any) => a + (Number(s.durationSec) || 0), 0);
            if (!manifest.project) manifest.project = {};
            manifest.project.totalDurationSec = sum;
          }
        }
      }

      // G2 — When script-timing is active, seed each scene with its shot's
      // dialogTurn + voiceover text (only where the LLM left them empty).
      // Speaker labels like "Sprecher 2" become "@sprecher-2" mentions which
      // the Speaker-Map / strict-cast passes then resolve to briefed cast.
      if (useScriptTiming && Array.isArray(manifest?.scenes)) {
        const slugify = (v: string) =>
          String(v ?? '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        for (let i = 0; i < manifest.scenes.length; i++) {
          const shot = scriptTiming.shots[i];
          if (!shot) continue;
          const sc = manifest.scenes[i];
          if (!sc || typeof sc !== 'object') continue;
          if (shot.text && (!sc.voiceover || !String(sc.voiceover.text ?? '').trim())) {
            sc.voiceover = { ...(sc.voiceover ?? {}), text: shot.text };
          }
          // Prefer the shot's sub-turns (Shot 1A + 1B inside SZENE 1). Only
          // seed when the LLM left dialogTurns empty — never overwrite.
          const turns = Array.isArray(shot.dialogTurns) ? shot.dialogTurns : [];
          const scHasTurns = Array.isArray(sc.dialogTurns) && sc.dialogTurns.length > 0;
          if (!scHasTurns && turns.length > 0) {
            sc.dialogTurns = turns.map((t: any) => ({
              speakerMentionKey: `@${slugify(t.speakerLabel) || `sprecher-${i + 1}`}`,
              text: String(t.text ?? '').trim(),
            }));
          } else if (!scHasTurns && shot.text && shot.speakerLabel) {
            const mention = `@${slugify(shot.speakerLabel) || `sprecher-${i + 1}`}`;
            sc.dialogTurns = [{ speakerMentionKey: mention, text: shot.text }];
          }
          // J4 — Location freetext from briefing (only if empty).
          if ((shot as any).locationHint) {
            const hint = String((shot as any).locationHint).trim();
            if (hint) {
              sc.location = sc.location && typeof sc.location === 'object' ? sc.location : {};
              if (!sc.location.locationId && !sc.location.description) {
                sc.location.description = hint;
              }
              if (!sc.location.mentionKey && !sc.location.locationName) {
                sc.location.locationName = hint;
              }
            }
          }
          // J6 — sceneKind + overlay for endcards / ensemble showcases.
          const kind = (shot as any).sceneKind;
          if (kind === 'endcard') {
            sc.sceneKind = 'endcard';
            sc.dialogTurns = [];
            sc.cast = [];
            if (sc.voiceover) sc.voiceover.text = '';
            const overlay = (shot as any).overlayText;
            if (overlay && !sc.overlayText) sc.overlayText = overlay;
          } else if (kind === 'ensemble_showcase') {
            sc.sceneKind = 'ensemble_showcase';
            sc.dialogTurns = [];
          }
        }
      }

      if (explicitBriefingTiming?.continuousScene && explicitBriefingTiming.sceneCount === 1 && Array.isArray(manifest?.scenes) && manifest.scenes.length === 1) {
        applyContinuousScriptTurns(manifest, scriptTiming, explicitBriefingTiming.durationSec);
      }

      // Duration Authority: explicit user briefing beats both board defaults
      // and model-generated speech estimates. For the AdTool-style case
      // ("Länge: ca. 15 Sekunden", "3 Szenen") this locks the manifest to
      // 15s / 3 scenes BEFORE auto-extend can inflate it from verbose
      // voiceover text.
      const explicitScriptLock = !!explicitBriefingTiming
        && scriptTiming.mode === 'SHOT_MARKERS'
        && Array.isArray(manifest?.scenes)
        && manifest.scenes.length > 0
        && (!explicitBriefingTiming.sceneCount || explicitBriefingTiming.sceneCount === manifest.scenes.length);
      if (explicitScriptLock) {
        const targetTotal = explicitBriefingTiming.durationSec;
        const currentSum = manifest.scenes.reduce((a: number, s: any) => a + (Number(s.durationSec) || 0), 0);
        const shouldRedistribute = Math.abs(currentSum - targetTotal) >= 0.5;
        if (shouldRedistribute) {
          const per = Math.max(1, Math.round((targetTotal / manifest.scenes.length) * 10) / 10);
          manifest.scenes = manifest.scenes.map((s: any, i: number) => ({ ...s, index: i + 1, durationSec: per }));
          const sum = manifest.scenes.reduce((a: number, s: any) => a + (Number(s.durationSec) || 0), 0);
          const drift = Math.round((targetTotal - sum) * 10) / 10;
          if (Math.abs(drift) >= 0.1 && manifest.scenes.length > 0) {
            const last = manifest.scenes[manifest.scenes.length - 1];
            last.durationSec = Math.max(1, Math.round((Number(last.durationSec) + drift) * 10) / 10);
          }
        }
        if (!manifest.project) manifest.project = {};
        manifest.project.totalDurationSec = targetTotal;
        (manifest as any).__explicitBriefingTiming = explicitBriefingTiming;
      }

      // G3 — Duration Auto-Extend. If the estimated speech length exceeds the
      // scene's target duration, bump the scene to `speechSec + 1s` so the VO
      // is never clipped. Runs whenever a script is present (scriptTiming),
      // even in Tier 2/3 — we always want to protect the VO.
      if (Array.isArray(manifest?.scenes)) {
        const explicitScriptLock = !!explicitBriefingTiming
          && scriptTiming.mode === 'SHOT_MARKERS'
          && (!explicitBriefingTiming.sceneCount || explicitBriefingTiming.sceneCount === manifest.scenes.length);
        // ~2.6 words/sec at natural pace; strip mood-suffix bracketed text.
        const WORDS_PER_SEC = 2.6;
        const estimateSec = (text: string): number => {
          const clean = String(text ?? '')
            .replace(/\[[^\]]*\]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (!clean) return 0;
          const words = clean.split(/\s+/).length;
          return words / WORDS_PER_SEC;
        };
        const adjustments: Array<{ scene: number; from: number; to: number; speechSec: number }> = [];
        for (let i = 0; i < manifest.scenes.length; i++) {
          const sc = manifest.scenes[i];
          if (!sc || typeof sc !== 'object') continue;
          const turns = Array.isArray(sc.dialogTurns) ? sc.dialogTurns : [];
          const spoken = turns.length > 0
            ? turns.map((t: any) => String(t?.text ?? '')).join(' ')
            : String(sc?.voiceover?.text ?? '');
          const speechSec = estimateSec(spoken);
          if (speechSec <= 0) continue;
          const target = Math.max(1, Math.round(speechSec + 1));
          const cur = Math.max(1, Math.round(Number(sc.durationSec) || 0));
          if (target > cur) {
            adjustments.push({ scene: i + 1, from: cur, to: target, speechSec: Math.round(speechSec * 10) / 10 });
            if (explicitScriptLock) continue;
            sc.durationSec = target;
          }
        }
        if (adjustments.length > 0 && !explicitScriptLock) {
          if (!manifest.project) manifest.project = {};
          const sum = manifest.scenes.reduce(
            (a: number, s: any) => a + (Number(s.durationSec) || 0),
            0,
          );
          manifest.project.totalDurationSec = sum;
          (manifest as any).__durationAutoExtend = adjustments;
        } else if (adjustments.length > 0 && explicitScriptLock) {
          (manifest as any).__durationAutoExtendBlocked = adjustments;
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
          // G-1: same retry bump as Pass A — cover flash flakiness before we
          // downgrade to flash-lite for the gap-fill pass.
          { model: 'google/gemini-2.5-flash',      timeoutMs: 30_000, maxTokens: 4000, retries: 2 },
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
    let fidelityStats: { mode: 'literal' | 'auto'; repairedTexts: number; repairedSpeakers: number; scenesMatched: number; scenesInScript: number } | null = null;
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

    // v216 — Continuous-Scene Cast Backfill.
    // ensureProductionPlanEnsembleServer skips scenes with dialogTurns
    // ("isExplicitlyScripted"). For a single continuous scene with 2+ briefed
    // speakers, that leaves un-referenced cast slots empty. Deterministically
    // inject every briefed character into the single scene's cast.
    try {
      const scenesArr = Array.isArray((plan as any)?.scenes) ? (plan as any).scenes : [];
      if (
        explicitBriefingTiming?.continuousScene &&
        scenesArr.length === 1
      ) {
        const requiredCast = extractSelectedCastFromBriefing(briefing, characters);
        if (requiredCast.length >= 2) {
          const sc = scenesArr[0];
          const cast = Array.isArray(sc.cast) ? [...sc.cast] : [];
          const keyOf = (c: any) => String(c?.characterId ?? c?.mentionKey ?? c?.characterName ?? '').toLowerCase();
          const present = new Set(cast.map(keyOf).filter(Boolean));
          let backfilled = 0;
          for (const req of requiredCast) {
            const k = keyOf(req);
            if (!k || present.has(k)) continue;
            if (cast.length >= 4) break;
            cast.push({ ...req, shotType: 'full' });
            present.add(k);
            backfilled += 1;
          }
          if (backfilled > 0) {
            sc.cast = cast;
            (plan as any)._meta = {
              ...((plan as any)._meta ?? {}),
              aiFilled: Array.from(new Set([
                ...(((plan as any)._meta?.aiFilled ?? []) as string[]),
                'scenes.cast.continuousSceneBackfill',
              ])),
            };
            console.log('[briefing-deep-parse] continuous_scene_cast_backfill', { backfilled, required: requiredCast.length });
          }
        }
      }
    } catch (e: any) {
      console.warn('[briefing-deep-parse] continuous scene backfill failed (non-fatal):', e?.message);
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

    // v213 — Briefing Fidelity Pass: when the briefing carried an explicit
    // "## Verbatim Script", enforce 1:1 dialog reproduction + speaker mapping.
    try {
      fidelityStats = enforceBriefingFidelity(plan, briefing);
      if (fidelityStats.mode === 'literal') {
        (plan as any)._meta = {
          ...((plan as any)._meta ?? {}),
          fidelity: fidelityStats,
        };
        console.log('[briefing-deep-parse] fidelity', fidelityStats);
      }
    } catch (e: any) {
      console.warn('[briefing-deep-parse] fidelity pass failed (non-fatal):', e?.message);
    }

    // G3 — Solo-Enforcement: for any scene whose dialogTurns name a single
    // unique speaker (typical "Sprecher N:" solo shot), trim cast to that
    // one character so ensemble-repair cannot leak the full ensemble in.
    let soloStats: { trimmedScenes: number; droppedSlots: number; scrubbedFields: number } | null = null;
    try {
      soloStats = enforceSoloCast(plan);
      if (soloStats.trimmedScenes > 0 || soloStats.scrubbedFields > 0) {
        (plan as any)._meta = {
          ...((plan as any)._meta ?? {}),
          soloEnforced: soloStats,
        };
        console.log('[briefing-deep-parse] solo_cast', soloStats);
      }
    } catch (e: any) {
      console.warn('[briefing-deep-parse] solo cast pass failed (non-fatal):', e?.message);
    }

    // v217 — Turn → Charakter-UUID Binding. Must run AFTER all cast passes
    // (ensemble, strict-cast, fidelity, solo) so the final scene cast is
    // stable. Client-Voice-Binding depends exclusively on this field.
    try {
      const bindStats = bindTurnSpeakerIds(plan);
      (plan as any)._meta = {
        ...((plan as any)._meta ?? {}),
        debug: {
          ...(((plan as any)._meta?.debug) ?? {}),
          turnBinding: bindStats,
        },
      };
      if (bindStats.total > 0) {
        console.log('[briefing-deep-parse] turn_binding', bindStats);
      }
    } catch (e: any) {
      console.warn('[briefing-deep-parse] turn binding failed (non-fatal):', e?.message);
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
    // Hoist so it stays in scope for the final response payload.
    const durationAutoExtend: any[] = Array.isArray((plan as any).__durationAutoExtend)
      ? (plan as any).__durationAutoExtend
      : [];
    const durationAutoExtendBlocked: any[] = Array.isArray((plan as any).__durationAutoExtendBlocked)
      ? (plan as any).__durationAutoExtendBlocked
      : [];
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
      try { delete (plan as any).__durationAutoExtend; } catch { /* noop */ }
      try { delete (plan as any).__durationAutoExtendBlocked; } catch { /* noop */ }
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
            fidelity: fidelityStats,
            voice_pool_assignments: voicePoolForMeta,
            script_timing: {
              mode: scriptTiming?.mode ?? 'FREETEXT',
              shots: scriptTiming?.shots?.length ?? 0,
              source: scriptTiming?.source ?? 'none',
            },
              duration_auto_extend: durationAutoExtend,
              duration_auto_extend_blocked: durationAutoExtendBlocked,
            solo_cast: soloStats,
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

    // Canonical total = actual scene sum (single source of truth). Reconcile
    // project.totalDurationSec if it drifted from the sum after any of the
    // scene-mutation passes (scene-count guard, G3 auto-extend, ensemble).
    const _scenes = Array.isArray((plan as any)?.scenes) ? (plan as any).scenes : [];
    const _sceneSum = _scenes.reduce((a: number, s: any) => a + (Number(s?.durationSec) || 0), 0);
    const _projectTotal = Number((plan as any)?.project?.totalDurationSec);
    const _canonicalTotal = _sceneSum > 0 ? _sceneSum : (Number.isFinite(_projectTotal) ? _projectTotal : null);
    if (_sceneSum > 0 && Number.isFinite(_projectTotal) && Math.abs(_projectTotal - _sceneSum) >= 0.5) {
      if (!(plan as any).project) (plan as any).project = {};
      (plan as any).project.totalDurationSec = _sceneSum;
    }
    const _canonicalScenes = _scenes.length;
    const _canonicalFromScript = scriptTiming?.mode === 'SHOT_MARKERS' && (scriptTiming?.shots?.length ?? 0) >= 2;

    // Phase 2 + Phase 8 (refactor): stamp the server's authoritative BriefingContract
    // onto plan._meta.debug so the client no longer has to re-run its own detectors.
    // Client code should prefer plan._meta.debug.briefing_contract when present.
    // Phase 8: every field is defensively coerced / clamped before stamping so no
    // NaN / undefined / out-of-range value can ever leak downstream.
    const _clampDur = (n: unknown): number | null => {
      const v = Number(n);
      if (!Number.isFinite(v) || v < 1) return null;
      return Math.max(1, Math.min(600, Math.round(v * 10) / 10));
    };
    const _clampSceneCount = (n: unknown): number => {
      const v = Number(n);
      if (!Number.isFinite(v) || v < 0) return 0;
      return Math.max(0, Math.min(24, Math.round(v)));
    };
    const _validModes = new Set(['FREETEXT', 'SHOT_MARKERS', 'SZENE_BLOCKS']);
    const _mode = _validModes.has(scriptTiming?.mode as string) ? (scriptTiming!.mode as string) : 'FREETEXT';
    const _validSources = new Set(['explicit-briefing', 'script', 'board']);
    const _rawSource = explicitBriefingTiming ? 'explicit-briefing' : (_canonicalFromScript ? 'script' : 'board');
    const _source = _validSources.has(_rawSource) ? _rawSource : 'board';
    const _briefingContract = {
      durationSec: _clampDur(_canonicalTotal),
      sceneCount: _clampSceneCount(_canonicalScenes),
      explicitSceneCount: !!explicitBriefingTiming?.explicitSceneCount,
      continuousScene: !!explicitBriefingTiming?.continuousScene,
      source: _source,
      scriptTimingMode: _mode,
      shots: _clampSceneCount(scriptTiming?.shots?.length ?? 0),
      pipelineVersion: 'v215',
    };
    try {
      if (!(plan as any)._meta) (plan as any)._meta = {};
      const _debug = ((plan as any)._meta.debug ?? {}) as Record<string, unknown>;
      _debug.briefing_contract = _briefingContract;
      // Back-compat: mirror as canonical_timing (shape expected by legacy client code).
      _debug.canonical_timing = {
        durationSec: _briefingContract.durationSec,
        sceneCount: _briefingContract.sceneCount,
        explicitSceneCount: _briefingContract.explicitSceneCount,
        continuousScene: _briefingContract.continuousScene,
        source: explicitBriefingTiming ? 'explicit-total' : (_canonicalFromScript ? 'time-windows' : 'explicit-total'),
      };
      (plan as any)._meta.debug = _debug;
    } catch { /* non-fatal */ }

    return new Response(JSON.stringify({ plan, version, briefing_contract: _briefingContract, timings: { passA_ms: tA - t0, passB_ms: tB - tA, total_ms: Date.now() - t0 }, passA_error: passAError, passB_error: passBError, passA_model: passAModelUsed, passB_model: passBModelUsed, passA_diagnostics: passADiagnostics, passB_diagnostics: passBDiagnostics, ensemble_repair: ensembleStats, strict_cast: strictCastStats, fidelity: fidelityStats, solo_cast: soloStats, script_timing: { mode: scriptTiming?.mode ?? 'FREETEXT', shots: scriptTiming?.shots?.length ?? 0, source: scriptTiming?.source ?? 'none' }, canonical: { duration_seconds: _canonicalTotal, scene_count: _canonicalScenes, source: explicitBriefingTiming ? 'explicit-briefing' : (_canonicalFromScript ? 'script' : 'board') }, duration_auto_extend: durationAutoExtend, duration_auto_extend_blocked: durationAutoExtendBlocked }), {

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
