/**
 * Prompt compiler — turns the fixed `SceneGrammar` field schema into a
 * provider-ready prompt string.
 *
 * Why this exists: LLMs write inconsistent prose. When the model only fills
 * labelled fields and deterministic code assembles the sentence, the output is
 * stable across runs and across providers. This is the cheapest reliability
 * win in the whole pipeline — it costs nothing at generation time.
 */

import type { SceneGrammar, CameraMove, ShotSize, LightingKey } from './types';

/** Kept byte-identical to the composer's clause so autopilot output matches manual scenes. */
export const GLOBAL_NEGATIVE_CLAUSE =
  'no on-screen text, no captions, no subtitles, no watermarks, no logos, no gibberish lettering, no distorted hands, no extra fingers, no duplicated faces';

const SHOT_SIZE_EN: Record<ShotSize, string> = {
  extreme_wide: 'extreme wide establishing shot',
  wide: 'wide shot',
  medium: 'medium shot',
  medium_close: 'medium close-up',
  close_up: 'close-up',
  extreme_close_up: 'extreme close-up',
  over_shoulder: 'over-the-shoulder shot',
  insert: 'tight insert shot',
};

const CAMERA_MOVE_EN: Record<CameraMove, string> = {
  static: 'locked-off static camera',
  slow_push_in: 'slow dolly push-in',
  slow_pull_out: 'slow dolly pull-out',
  handheld: 'subtle handheld movement',
  pan_left: 'smooth pan to the left',
  pan_right: 'smooth pan to the right',
  tilt_up: 'slow tilt upward',
  tilt_down: 'slow tilt downward',
  whip_pan: 'fast whip pan',
  orbit: 'slow orbit around the subject',
  crane_down: 'crane descending toward the subject',
  rack_focus: 'rack focus from foreground to subject',
  overhead_top_down: 'overhead top-down camera',
  dutch_angle: 'tilted dutch angle',
};

const LIGHTING_EN: Record<LightingKey, string> = {
  golden_hour: 'warm golden-hour sunlight with long shadows',
  soft_window: 'soft diffused window light',
  hard_sun: 'hard midday sunlight, crisp shadows',
  overcast: 'flat overcast daylight',
  studio_softbox: 'clean studio softbox lighting',
  high_key: 'bright high-key lighting, minimal shadows',
  low_key: 'moody low-key lighting, deep shadows',
  neon_night: 'neon night lighting, colored practicals',
  candle_warm: 'warm candlelight, intimate glow',
  clinical_white: 'even clinical white light',
};

/**
 * Camera moves that video models handle poorly at short durations. The router
 * downgrades these rather than gambling a paid generation on them.
 */
const RISKY_MOVES: CameraMove[] = ['whip_pan', 'orbit', 'crane_down'];

const MIN_SECONDS_FOR_RISKY_MOVE = 5;

/**
 * The LLM occasionally answers with a label outside our enum ("extreme wide",
 * "Close Up", "dolly in"). Without coercion the label lookup returns undefined
 * and the storyboard renders "undefined · undefined · undefined".
 */
function coerceKey<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if ((allowed as readonly string[]).includes(key)) return key as T;
  // Tolerate near misses: "extreme_wide_shot" → "extreme_wide".
  const hit = allowed.find((a) => key.startsWith(a) || a.startsWith(key));
  return (hit ?? fallback) as T;
}

export function sceneShotSize(scene: SceneGrammar): ShotSize {
  return coerceKey(scene.shotSize, Object.keys(SHOT_SIZE_EN) as ShotSize[], 'medium');
}

export function sceneLighting(scene: SceneGrammar): LightingKey {
  return coerceKey(scene.lighting, Object.keys(LIGHTING_EN) as LightingKey[], 'soft_window');
}

function normalizeMove(scene: SceneGrammar): CameraMove {
  const move = coerceKey(scene.cameraMove, Object.keys(CAMERA_MOVE_EN) as CameraMove[], 'static');
  if (RISKY_MOVES.includes(move) && scene.durationSeconds < MIN_SECONDS_FOR_RISKY_MOVE) {
    return move === 'whip_pan' ? 'pan_right' : 'slow_push_in';
  }
  return move;
}

function joinNegatives(scene: SceneGrammar): string {
  const extra = (scene.negatives ?? []).map((n) => n.trim()).filter(Boolean);
  return [GLOBAL_NEGATIVE_CLAUSE, ...extra].join(', ');
}

function cleanClause(value: string): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').replace(/[.,;]+$/, '');
}

/**
 * Stilabweichungen sind der teuerste Fehler im Autopilot: eine Anime-Szene
 * zwischen realen Aufnahmen macht den ganzen Film unbrauchbar. Diese Klausel
 * hängt zusätzlich zur globalen Negativliste an jedem Autopilot-Prompt.
 */
export const STYLE_NEGATIVE_CLAUSE =
  'no anime, no manga, no illustration, no cartoon, no comic, no painting, no 3d render, no CGI look, no stylised filter';

export interface PromptStyleOptions {
  /**
   * Produktionsweiter Look-Block (englisch). Identisch für jede Szene eines
   * Films — ohne ihn erfindet das Bildmodell pro Szene einen neuen Stil.
   */
  styleBible?: string;
  /** Namen der Figuren, die im Bild als Subjekt gebunden werden sollen. */
  characterNames?: string[];
}

/**
 * Baut den Look-Block eines Films. Deterministisch aus Genre, Stimmung und
 * Lichtsetzung der ersten Szenen abgeleitet — kein zusätzlicher LLM-Call.
 */
export function deriveStyleBible(input: {
  genre?: string;
  scenes: SceneGrammar[];
  brandTone?: string | null;
}): string {
  const scenes = input.scenes ?? [];
  const moods = Array.from(
    new Set(scenes.map((s) => cleanClause(s.mood)).filter(Boolean)),
  ).slice(0, 3);
  const lighting = LIGHTING_EN[sceneLighting(scenes[0] ?? ({} as SceneGrammar))];
  const lens = cleanClause(scenes[0]?.lens ?? '') || '35mm';

  return [
    'live-action photorealistic commercial film',
    'shot on a full-frame cinema camera with natural skin texture and real depth of field',
    `consistent ${lens} lens character across all shots`,
    `consistent ${lighting} as the base lighting signature`,
    'unified cinematic color grading, filmic contrast, subtle film grain',
    moods.length ? `overall tone: ${moods.join(', ')}` : '',
    input.brandTone ? `brand tone: ${cleanClause(input.brandTone)}` : '',
    'every shot of this film must look like it came from the same camera, same lighting crew and same colorist',
  ]
    .filter(Boolean)
    .join('; ');
}

/** Bindet die Figur namentlich an das Referenzportrait. */
function subjectClause(scene: SceneGrammar, names?: string[]): string {
  const subject = cleanClause(scene.subject);
  const list = (names ?? []).map((n) => cleanClause(n)).filter(Boolean);
  if (list.length === 0) return subject;
  const bound = list
    .map((name, index) => `${name} (identical to reference portrait ${index + 1})`)
    .join(' and ');
  return `${bound}, ${subject}`;
}

/**
 * Prompt for the ANCHOR still. Deliberately omits camera movement — a still has
 * none — and leans on composition and lighting instead.
 */
export function compileAnchorPrompt(scene: SceneGrammar, opts?: PromptStyleOptions): string {
  const parts = [
    SHOT_SIZE_EN[sceneShotSize(scene)],
    subjectClause(scene, opts?.characterNames),
    cleanClause(scene.action),
    `in ${cleanClause(scene.environment)}`,
    `shot on ${cleanClause(scene.lens)} lens`,
    LIGHTING_EN[sceneLighting(scene)],
    `${cleanClause(scene.mood)} mood`,
    'photorealistic, cinematic color grading, sharp focus on the subject',
  ];
  const style = opts?.styleBible ? ` FILM LOOK: ${cleanClause(opts.styleBible)}.` : '';
  return `${parts.join(', ')}.${style} Avoid: ${joinNegatives(scene)}, ${STYLE_NEGATIVE_CLAUSE}.`;
}

/**
 * Prompt for the MOTION pass. Assumes an anchor image is supplied as the first
 * frame, so it describes movement rather than re-describing the whole frame.
 */
export function compileMotionPrompt(
  scene: SceneGrammar,
  opts?: { hasAnchor?: boolean; silentMouth?: boolean } & PromptStyleOptions,
): string {
  const move = CAMERA_MOVE_EN[normalizeMove(scene)];
  const silent = opts?.silentMouth
    ? 'nobody speaks on camera, lips stay closed and still'
    : '';

  if (opts?.hasAnchor === false) {
    // Text-to-video fallback: the frame has to be described in full.
    const parts = [
      SHOT_SIZE_EN[sceneShotSize(scene)],
      subjectClause(scene, opts?.characterNames),
      cleanClause(scene.action),
      `in ${cleanClause(scene.environment)}`,
      move,
      `shot on ${cleanClause(scene.lens)} lens`,
      LIGHTING_EN[sceneLighting(scene)],
      `${cleanClause(scene.mood)} mood`,
      'live-action photorealistic',
      silent,
    ].filter(Boolean);
    return `${parts.join(', ')}. Avoid: ${joinNegatives(scene)}, ${STYLE_NEGATIVE_CLAUSE}.`;
  }

  const parts = [
    cleanClause(scene.action),
    move,
    'natural physics, consistent lighting, the subject keeps the same face, hair, clothing and colors as the reference frame',
    silent,
  ].filter(Boolean);
  return `${parts.join(', ')}. Avoid: ${joinNegatives(scene)}, ${STYLE_NEGATIVE_CLAUSE}.`;
}


/** Human-readable one-liner for the production log / storyboard card. */
export function describeScene(scene: SceneGrammar): string {
  return `${SHOT_SIZE_EN[sceneShotSize(scene)]} · ${CAMERA_MOVE_EN[normalizeMove(scene)]} · ${LIGHTING_EN[sceneLighting(scene)]}`;
}

/**
 * Word budget guard. Providers degrade with overlong prompts; this keeps the
 * compiled string inside a safe band without truncating mid-word.
 */
export function clampPromptWords(prompt: string, maxWords = 95): string {
  const words = prompt.split(/\s+/);
  if (words.length <= maxWords) return prompt;
  return `${words.slice(0, maxWords).join(' ')}.`;
}
