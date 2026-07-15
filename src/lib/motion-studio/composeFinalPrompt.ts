// =============================================================================
// composeFinalPrompt — Director Console (8-Layer Prompt Architecture)
// =============================================================================
//
// Derives the FINAL provider-ready prompt for a scene from:
//   1. SUBJECT      (cast + auto-injected brand character)
//   2. ACTION       (raw user prompt — what happens, in time)
//   3. SHOT         (Shot Director / cinematic preset / director modifiers)
//   4. LIGHT/MOOD   (currently merged into shot layer via existing dedup)
//   5. DIALOG       (deterministic Audio Plan from `scene.audioPlan`)
//   6. SFX/AMBIENT  (reserved — Phase 5)
//   7. STYLE        (style preset / director modifiers — handled by dedup)
//   8. NEGATIVE     (extracted into separate `negative_prompt` channel)
//
// This function is **pure**: it never mutates the scene, never writes state,
// and never reads `aiPrompt` — only the structured slots + audioPlan.
// That structurally eliminates the previous race-condition where
// `useEffect` chains could overwrite the timed audio plan with a text-only
// fallback.
//
// Used as a `useMemo` source by SceneCard / SceneDirectorConsole instead of
// the legacy `applyDialogToPrompt(scene.aiPrompt, …)` pattern.
//
// The Veo 3 / Sora 2 / Artlist research (May 2026) consistently recommends
// labelled layers for multi-speaker dialog. We emit them as `[N LAYER]`
// markers so engines that respect the schema (Veo, Sora) lock onto it,
// while comma-tolerant engines (Hailuo, Kling) just see well-ordered prose.
// Provider-specific re-formatting lives in `providerPromptFormats.ts`.

import type { AudioPlan, AudioPlanSpeaker } from '@/types/video-composer';
import type { ShotSelection } from '@/config/shotDirector';
import {
  composePromptLayers,
  type ComposerInputs,
  type ComposerResult,
} from './composePromptLayers';
import {
  buildPerTurnShotBlock,
  hasPerTurnOverrides,
} from '@/lib/shotDirector/buildPerTurnShotBlock';
import {
  buildPerformanceBlock,
  type PerformanceEntry,
} from './buildPerformanceBlock';

export type DirectorLanguage = 'de' | 'en' | 'es';

export interface ComposeFinalPromptInputs extends ComposerInputs {
  /** Authoritative timing data when dialog has been TTS-locked. */
  audioPlan?: AudioPlan;
  /** Optional sound design notes (Phase 5+). */
  sfxNotes?: string;
  ambientNotes?: string;
  /**
   * Phase 3.1 pre-lock overlay — per-line Shot Director overrides keyed by
   * `${characterId}-${idx}`. Applied when an AudioPlanSpeaker has no own
   * `shotDirector`. Ignored once the speaker entry carries the override.
   */
  dialogShotOverrides?: Record<string, Partial<ShotSelection>>;
  /**
   * Phase 2 — per-character Performance Layer (Mimik / Gestik / Blick / Energy).
   * Emitted as `[4 PERFORMANCE]` between SHOT and DIALOG only when at least
   * one entry has a non-empty performance. Lip-sync pipeline ignores it
   * (works off `audioPlan`, not `aiPrompt`).
   */
  performanceEntries?: PerformanceEntry[];
}


export interface ComposeFinalPromptResult extends ComposerResult {
  /** The labelled, multi-line "screenplay" prompt as shipped to providers. */
  finalPrompt: string;
  /** Deterministic dialog block (empty string if no audioPlan). */
  audioPlanText: string;
  /** True if at least one speaker has a measured `endSec` > 0. */
  hasLockedAudioPlan: boolean;
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function snippet(text: string, max = 220): string {
  const t = (text ?? '').trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

/**
 * Format the Audio Plan as a human + model readable block.
 *
 * Output is intentionally close to the Artlist "timestamp prompting" style:
 *   - one outcome per line
 *   - explicit "do not deviate" instruction
 *   - lip-sync constraint stated as its own line so models without
 *     dialog awareness still get a strong cue
 *   - language tag forces ElevenLabs/HeyGen to keep accent stable
 */
export function formatAudioPlan(
  plan: AudioPlan | undefined,
  language: DirectorLanguage = 'en',
): string {
  if (!plan?.speakers?.length) return '';
  const lines: string[] = ['Audio plan (exact, do not deviate):'];
  for (const s of plan.speakers) {
    lines.push(
      `- ${fmt(s.startSec)}s–${fmt(s.endSec)}s  ${s.name} speaks: "${snippet(s.text, 200)}"`,
    );
  }
  const langWord = language === 'de' ? 'German' : language === 'es' ? 'Spanish' : 'English';
  lines.push(
    `Total spoken duration: ${fmt(plan.totalSec)}s. Use this exact speaker order and timing for lip-sync. Spoken language: ${langWord}.`,
  );
  // Multi-speaker safeguard — without this, single-clip i2v models tend to
  // make the first visible character lip-sync the entire dialog.
  const uniqueSpeakers = new Set(plan.speakers.map((s) => s.characterId)).size;
  if (uniqueSpeakers >= 2) {
    lines.push(
      'Multiple speakers share the frame: do NOT make one character mouth all the lines. Keep mouth movement subtle and neutral on all characters; treat the dialog above as voiceover timing, not as a single-actor monologue.',
    );
  }
  return lines.join('\n');
}


/**
 * Build a one-line cast summary listing every speaker referenced by the
 * audio plan (deduped, in script order). Used for the [1 SUBJECT] layer.
 */
export function buildCastLine(plan?: AudioPlan): string {
  if (!plan?.speakers?.length) return '';
  const seen = new Set<string>();
  const names: string[] = [];
  for (const s of plan.speakers) {
    if (!seen.has(s.characterId)) {
      seen.add(s.characterId);
      names.push(s.name);
    }
  }
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} on camera.`;
  const last = names.pop();
  return `${names.join(', ')} and ${last} on camera.`;
}

const NEGATIVE_DEFAULT =
  'no on-screen text, no captions, no subtitles, no signs, no watermarks, no logos.';

/**
 * Main composer — derives final prompt from structured inputs only.
 */
export function composeFinalPrompt(
  inputs: ComposeFinalPromptInputs,
): ComposeFinalPromptResult {
  // 1. Run the proven dedup / brand-inject / negative-sanitize pipeline on
  //    the raw action prompt. This produces the cinematography + subject
  //    body PLUS a clean negative prompt.
  const layered = composePromptLayers(inputs);

  // 2. Audio Plan — first-class, immutable.
  const lang: DirectorLanguage = (inputs.language as DirectorLanguage) ?? 'en';
  const audioPlanText = formatAudioPlan(inputs.audioPlan, lang);
  const hasLocked = !!inputs.audioPlan?.speakers?.some((s) => s.endSec > 0);

  // 3. Stitch the labelled "screenplay" prompt. Each layer is on its own
  //    line so:
  //      • Veo / Sora pick up the bracketed labels as structural hints
  //      • Hailuo / Kling read it as well-ordered prose
  //      • Humans see exactly which slot drives which behaviour
  const cast = buildCastLine(inputs.audioPlan);
  const lines: string[] = [];

  if (cast) lines.push(`[1 SUBJECT] ${cast}`);

  // The "action" body comes from `layered.finalPrompt` minus the trailing
  // cinematography clause (we re-emit it as its own [3 SHOT] layer below).
  // We split on the literal " Cinematography: " marker emitted by
  // composePromptLayers.
  const fp = layered.finalPrompt || '';
  let actionBody = fp;
  let shotBody = '';
  const cinematographyIdx = fp.indexOf('Cinematography:');
  if (cinematographyIdx >= 0) {
    actionBody = fp.slice(0, cinematographyIdx).replace(/[.,;\s]+$/, '').trim();
    shotBody = fp
      .slice(cinematographyIdx + 'Cinematography:'.length)
      .replace(/^\s+/, '')
      .replace(/\.\s*$/, '')
      .trim();
  }
  if (actionBody) {
    // Phase 1 hygiene: when `applyActionsToPrompt` has already prepended
    // `[SceneAction]` / `[CastActions]` marker blocks, those markers are
    // themselves prompt-grade structural tags. Wrapping them inside another
    // `[2 ACTION] …` clause makes the prompt noisier and produces nested
    // bracket clutter like `[2 ACTION] [SceneAction] …`. Emit raw in that
    // case and only wrap when the body is plain prose.
    const startsWithMarker = /^\s*\[(SceneAction|CastActions)\]/i.test(actionBody);
    if (startsWithMarker) {
      lines.push(actionBody.replace(/\.\s*$/, '') + '.');
    } else {
      lines.push(`[2 ACTION] ${actionBody}.`);
    }
  }
  if (shotBody) lines.push(`[3 SHOT] ${shotBody}.`);

  // [4 PERFORMANCE] — Phase 2 per-character Mimik/Gestik/Blick/Energy.
  // Always sits between SHOT and DIALOG so Sync.so / HeyGen never see it
  // (the lip-sync pipeline reads `audioPlan`, not `aiPrompt`).
  const performanceBlock = buildPerformanceBlock(inputs.performanceEntries ?? []);
  if (performanceBlock) {
    lines.push(performanceBlock);
  }

  if (audioPlanText) {
    lines.push(`[5 DIALOG]\n${audioPlanText}`);
  }


  // [6 DIALOG SHOTS] — Phase 3.1 per-turn Shot Director overrides. Only
  // emitted when at least one speaker carries an override; pure additive.
  if (hasPerTurnOverrides(inputs.audioPlan, inputs.dialogShotOverrides)) {
    const perTurn = buildPerTurnShotBlock(inputs.audioPlan, inputs.dialogShotOverrides);
    if (perTurn) lines.push(`[6 DIALOG SHOTS]\n${perTurn}`);
  }

  if (inputs.sfxNotes?.trim()) {
    lines.push(`[6 SFX] ${inputs.sfxNotes.trim()}`);
  }
  if (inputs.ambientNotes?.trim()) {
    lines.push(`[6 AMBIENT] ${inputs.ambientNotes.trim()}`);
  }

  // [7 CAMERA LOCK] — v243. When two or more speakers share the frame we
  // MUST prevent the video model from cutting, reframing or rearranging
  // the shot mid-clip (root cause of "layout morph at t≈4s" in Sync.so
  // multi-speaker plates). Speakers are still free to gesture, look
  // around, write, walk in place etc. — only the camera + frame
  // composition + speaker presence are locked.
  const uniqueSpeakerCount = inputs.audioPlan?.speakers
    ? new Set(inputs.audioPlan.speakers.map((s) => s.characterId)).size
    : 0;
  if (uniqueSpeakerCount >= 2) {
    lines.push(
      '[7 CAMERA LOCK] Locked static camera on tripod. Fixed frame, fixed focal length, no camera movement of any kind. All speakers remain fully visible in frame, in the same relative positions, from the first frame to the last. Speakers may move naturally — gesture, look around, write, subtle body movement — but must NOT leave frame or swap positions. Single continuous shot, no cuts, no transitions, no reframing, no zoom, no pan, no dolly, no split-screen, no grid rearrangement, no new characters entering, no character disappearing.',
    );
  }

  // Negative — always last so providers that respect the trailing tag
  // still pick it up even if they ignore the bracket schema.
  const baseNegative = layered.negativePrompt || NEGATIVE_DEFAULT;
  const cameraLockNegative =
    uniqueSpeakerCount >= 2
      ? ', camera cut, camera pan, camera zoom, dolly, reframe, split screen, grid layout, 2x2 grid, new shot, transition, speaker leaves frame, speaker walks out of frame, character disappears, new characters entering, rearrangement, layout change'
      : '';
  const negative = baseNegative.replace(/\.\s*$/, '') + cameraLockNegative + '.';
  lines.push(`[8 NEGATIVE] ${negative}`);


  const finalPrompt = lines.join('\n');

  return {
    ...layered,
    finalPrompt,
    audioPlanText,
    hasLockedAudioPlan: hasLocked,
  };
}
