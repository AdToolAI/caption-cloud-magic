/**
 * dialogPreflight — UX guard in front of `compose-twoshot-audio` (v430 Step 0).
 *
 * The server stays fail-closed: it aborts with `dialog_too_long_for_plate`
 * when the spoken track exceeds the plate by more than 5 s. This preflight
 * only prevents the user from burning credits on a run that cannot succeed —
 * and it measures the *canonical* dialog (`resolveEffectiveDialog`), not the
 * possibly stale `dialog_turns`.
 */
import {
  resolveEffectiveDialog,
  type EffectiveDialogSceneInput,
  type ResolveEffectiveDialogOptions,
} from './resolveEffectiveDialog';
import { estimateSpokenSeconds, dialogExceedsPlate } from '../estimateSpokenSeconds';

export interface DialogPreflightResult {
  spokenSec: number;
  exceedsPlate: boolean;
  turnCount: number;
  diverged: boolean;
}

/** Render the effective dialog back into a `Name: text` script for estimation. */
export function effectiveDialogToScript(
  scene: EffectiveDialogSceneInput | null | undefined,
  options: ResolveEffectiveDialogOptions = {},
): { script: string; turnCount: number; diverged: boolean } {
  const effective = resolveEffectiveDialog(scene, options);
  if (effective.turns.length === 0) {
    const raw = String(scene?.dialogScript ?? scene?.dialog_script ?? '');
    return { script: raw, turnCount: 0, diverged: false };
  }
  return {
    script: effective.turns.map((t) => `${t.displayName ?? 'S'}: ${t.text}`).join('\n'),
    turnCount: effective.turns.length,
    diverged: effective.diverged,
  };
}

export function dialogPreflight(
  scene: EffectiveDialogSceneInput | null | undefined,
  sceneDurationSec: number,
  providerMaxSec: number,
  options: ResolveEffectiveDialogOptions = {},
): DialogPreflightResult {
  const { script, turnCount, diverged } = effectiveDialogToScript(scene, options);
  const spokenSec = estimateSpokenSeconds(script);
  return {
    spokenSec,
    exceedsPlate: dialogExceedsPlate(spokenSec, sceneDurationSec, providerMaxSec),
    turnCount,
    diverged,
  };
}
