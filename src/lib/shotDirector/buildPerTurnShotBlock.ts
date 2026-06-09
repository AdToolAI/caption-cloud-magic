/**
 * buildPerTurnShotBlock — emit a `[6 DIALOG SHOTS]` prompt block listing
 * per-speaker cinematography overrides keyed to the AudioPlan timeline.
 *
 * Used by `composeFinalPrompt` to layer Phase-3 per-turn Shot Direction on
 * top of the scene-level `[3 SHOT]` block. Output is always English (core
 * project rule: AI visual prompts in English only).
 *
 * The block is *additive* — single-clip native-dialogue providers (Hailuo,
 * Kling Omni, Veo, HappyHorse) read it as soft hints. For Composer's
 * SRS / cinematic-sync paths that spawn per-turn sub-scenes, the per-turn
 * fragments become the authoritative Shot Direction for that sub-clip.
 */
import type { AudioPlan, AudioPlanSpeaker } from '@/types/video-composer';
import type { ShotSelection } from '@/config/shotDirector';
import { buildShotPromptSuffix } from './buildShotPromptSuffix';

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * Returns the `[6 DIALOG SHOTS]` block, or empty string if no speaker
 * carries a per-turn shotDirector override.
 *
 * @param plan       AudioPlan with optional `speakers[i].shotDirector`.
 * @param overlay    Optional pre-lock overlay keyed by lineKey or speaker
 *                   index — applied when speaker.shotDirector is empty.
 */
export function buildPerTurnShotBlock(
  plan: AudioPlan | undefined,
  overlay?: Record<string, Partial<ShotSelection>>,
): string {
  if (!plan?.speakers?.length) {
    // No locked plan but overlays may still exist (pre-TTS state).
    // We can't emit timestamps without a plan, so suppress until lock.
    return '';
  }

  const lines: string[] = [];
  plan.speakers.forEach((sp, idx) => {
    const sel = pickOverride(sp, overlay, idx);
    if (!sel || Object.keys(sel).length === 0) return;
    const suffix = buildShotPromptSuffix(sel as ShotSelection);
    if (!suffix) return;
    // Strip "Cinematography: " prefix + trailing dot from the suffix so it
    // reads naturally as a per-turn fragment.
    const fragment = suffix.replace(/^Cinematography:\s*/, '').replace(/\.\s*$/, '');
    lines.push(`@${fmt(sp.startSec)}s (${sp.name}): ${fragment}`);
  });

  if (lines.length === 0) return '';
  return lines.join('\n');
}

function pickOverride(
  sp: AudioPlanSpeaker,
  overlay: Record<string, Partial<ShotSelection>> | undefined,
  idx: number,
): Partial<ShotSelection> | undefined {
  const fromPlan = sp.shotDirector;
  if (fromPlan && Object.keys(fromPlan).length > 0) return fromPlan;
  if (!overlay) return undefined;
  // Try lineKey-style match (`${characterId}-${idx}`) then plain index.
  return overlay[`${sp.characterId}-${idx}`] ?? overlay[String(idx)] ?? overlay[sp.characterId];
}

export function hasPerTurnOverrides(
  plan: AudioPlan | undefined,
  overlay?: Record<string, Partial<ShotSelection>>,
): boolean {
  if (overlay && Object.values(overlay).some((s) => s && Object.keys(s).length > 0)) return true;
  if (!plan?.speakers?.length) return false;
  return plan.speakers.some((s) => s.shotDirector && Object.keys(s.shotDirector).length > 0);
}
