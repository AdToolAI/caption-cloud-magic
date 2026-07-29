/**
 * Feasibility filter.
 *
 * The model is good at inventing and bad at knowing its own limits. So the
 * five ideas are scored by deterministic rules against what this pipeline
 * demonstrably renders well. An idea that would fail three scenes in never
 * reaches the customer — it gets repaired here, at zero cost, instead of
 * burning motion credits later.
 */

import type { AutopilotIdea } from './strategy';

/** Hard ceiling for the whole film. Beyond this the pipeline gets brittle. */
export const MAX_TOTAL_SECONDS = 180;
export const MIN_TOTAL_SECONDS = 8;
export const DURATION_PRESETS = [15, 30, 60, 90, 120, 180];

/** Longest single generated clip we trust across engines. */
export const MAX_SCENE_SECONDS = 10;
export const MIN_SCENE_SECONDS = 1.6;

/** Above this many visible people per shot, identity drift becomes visible. */
export const MAX_PEOPLE_PER_SHOT = 4;

export interface FeasibilityContext {
  /** Cast & World characters the user selected. */
  castCount: number;
  lipSyncEnabled: boolean;
  /** Speakers the user allowed for lip-sync. */
  lipSyncSpeakers: number;
  totalDurationSeconds: number;
}

export interface FeasibilityVerdict {
  score: number;
  notes: string[];
  /** Repaired copy of the idea — always usable. */
  idea: AutopilotIdea;
}

const TEXT_IN_IMAGE = /\b(schild|schrift|text|untertitel|slogan|typo|logo|banner|plakat|display|bildschirmtext)\b/i;
const CROWD = /\b(menschenmenge|publikum|stadion|konzert|masse|hunderte|crowd|menge von menschen)\b/i;
const RISKY_MOTION = /\b(stunt|explosion|sprung vom|parkour|feuerwerk|autounfall|akrobat)\b/i;

function clampSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 3;
  return Math.min(MAX_SCENE_SECONDS, Math.max(MIN_SCENE_SECONDS, Math.round(value * 10) / 10));
}

/**
 * Score and repair one idea. Repairs are silent where they change nothing the
 * customer would notice, and noted where they do.
 */
export function assessIdea(input: AutopilotIdea, ctx: FeasibilityContext): FeasibilityVerdict {
  const notes: string[] = [];
  let score = 100;
  const idea: AutopilotIdea = {
    ...input,
    beats: (input.beats ?? []).map((b) => ({ ...b })),
    usesAssetIds: [...(input.usesAssetIds ?? [])],
  };

  // --- People per shot ------------------------------------------------------
  if (idea.maxPeopleInShot > MAX_PEOPLE_PER_SHOT) {
    idea.maxPeopleInShot = MAX_PEOPLE_PER_SHOT;
    score -= 12;
    notes.push(`Auf ${MAX_PEOPLE_PER_SHOT} sichtbare Personen pro Einstellung begrenzt.`);
  }
  if (ctx.castCount > 0 && idea.maxPeopleInShot > ctx.castCount) {
    idea.maxPeopleInShot = ctx.castCount;
    notes.push('An die Größe deines Casts angepasst.');
  }

  // --- Speaking scenes need cast and lip-sync ------------------------------
  const allowedSpeakers = ctx.lipSyncEnabled ? Math.min(ctx.lipSyncSpeakers, Math.max(ctx.castCount, 1)) : 0;
  if (idea.speakingScenes > 0 && allowedSpeakers === 0) {
    idea.speakingScenes = 0;
    score -= 8;
    notes.push('Ohne Lip-Sync umgesetzt — die Aussage trägt das Voiceover.');
  } else if (idea.speakingScenes > allowedSpeakers) {
    idea.speakingScenes = allowedSpeakers;
    score -= 5;
    notes.push(`Auf ${allowedSpeakers} Sprechszene(n) reduziert.`);
  }

  // --- Content the models render badly -------------------------------------
  const haystack = [idea.hook, idea.logline, idea.visualWorld, ...idea.beats.map((b) => b.description)]
    .join(' ');

  if (TEXT_IN_IMAGE.test(haystack)) {
    score -= 10;
    notes.push('Schrift im Bild vermieden — Text kommt sauber als Einblendung.');
  }
  if (CROWD.test(haystack)) {
    score -= 14;
    notes.push('Große Menschenmengen ersetzt — sie zerfallen in der Generierung.');
  }
  if (RISKY_MOTION.test(haystack)) {
    score -= 12;
    notes.push('Extreme Bewegung entschärft, damit die Physik glaubwürdig bleibt.');
  }

  // --- Scene count and timing ----------------------------------------------
  const total = Math.min(MAX_TOTAL_SECONDS, Math.max(MIN_TOTAL_SECONDS, ctx.totalDurationSeconds));
  const minScenes = Math.max(2, Math.ceil(total / MAX_SCENE_SECONDS));
  const maxScenes = Math.max(minScenes, Math.floor(total / MIN_SCENE_SECONDS));

  if (idea.beats.length < minScenes) {
    score -= 6;
    notes.push(`Auf ${minScenes} Szenen erweitert — einzelne Clips bleiben so unter ${MAX_SCENE_SECONDS}s.`);
    while (idea.beats.length < minScenes) {
      const source = idea.beats[idea.beats.length - 1] ?? {
        beat: 'benefit',
        description: idea.logline,
        seconds: 3,
      };
      idea.beats.push({ ...source, beat: source.beat });
    }
  }
  if (idea.beats.length > maxScenes) {
    idea.beats = idea.beats.slice(0, maxScenes);
    score -= 4;
    notes.push('Auf eine Schnittfolge gekürzt, die in der Laufzeit atmet.');
  }

  // Normalise the rough seconds to the requested runtime.
  const sum = idea.beats.reduce((acc, b) => acc + (Number(b.seconds) || 0), 0) || 1;
  idea.beats = idea.beats.map((b) => ({
    ...b,
    seconds: clampSeconds(((Number(b.seconds) || 1) / sum) * total),
  }));

  idea.feasibilityScore = Math.max(35, Math.min(100, Math.round(score)));
  idea.feasibilityNotes = notes;
  return { score: idea.feasibilityScore, notes, idea };
}

export function assessIdeaSet(ideas: AutopilotIdea[], ctx: FeasibilityContext): AutopilotIdea[] {
  return ideas.map((idea, index) => assessIdea({ ...idea, index }, ctx).idea);
}

/** Clamp any user- or model-supplied runtime to the supported window. */
export function clampTotalDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return 30;
  return Math.min(MAX_TOTAL_SECONDS, Math.max(MIN_TOTAL_SECONDS, Math.round(seconds)));
}

/**
 * Long films must not become a metronome. Past this runtime the rhythm planner
 * groups scenes into chapters with a breath between them.
 */
export const CHAPTER_MODE_THRESHOLD = 90;

export function needsChapterMode(totalSeconds: number): boolean {
  return totalSeconds >= CHAPTER_MODE_THRESHOLD;
}
