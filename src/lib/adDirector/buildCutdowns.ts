/**
 * Build cutdown variants from a master ad scene list.
 *
 * - 15s cutdown:  keep hook + solution + cta (skip problem + social-proof + demo).
 *                 If total still > 15s, scale durations proportionally.
 * - 6s hook-cut:  hook only + collapsed CTA overlay on the same hook frame.
 *
 * Cutdowns reuse the master clip URLs verbatim — no AI regeneration needed.
 * Composer-level re-render still costs ~50 credits per cutdown.
 */

import type { ComposerScene } from '@/types/video-composer';

export type CutdownType = 'master' | '15s' | '6s-hook';

export interface CutdownResult {
  type: CutdownType;
  scenes: ComposerScene[];
  totalDurationSec: number;
}

/** Order of preference for the 15s cutdown (front to back). */
const KEEP_15S: ReadonlyArray<string> = ['hook', 'solution', 'cta'];

function rescaleToTarget(scenes: ComposerScene[], targetSec: number): ComposerScene[] {
  const current = scenes.reduce((s, sc) => s + sc.durationSeconds, 0);
  if (current <= targetSec || current === 0) return scenes;
  const factor = targetSec / current;
  return scenes.map((s) => ({
    ...s,
    durationSeconds: Math.max(1, Math.round(s.durationSeconds * factor * 10) / 10),
  }));
}

export function buildCutdown(
  master: ComposerScene[],
  type: CutdownType,
): CutdownResult {
  if (type === 'master' || master.length === 0) {
    return {
      type: 'master',
      scenes: master,
      totalDurationSec: master.reduce((s, sc) => s + sc.durationSeconds, 0),
    };
  }

  if (type === '15s') {
    const filtered = master
      .filter((s) => KEEP_15S.includes(s.sceneType))
      .map((s, i) => ({
        ...s,
        id: `cd15-${s.id}`,
        orderIndex: i,
      }));
    const scaled = rescaleToTarget(filtered, 15);
    return {
      type,
      scenes: scaled,
      totalDurationSec: scaled.reduce((s, sc) => s + sc.durationSeconds, 0),
    };
  }

  // 6s-hook
  const hook = master.find((s) => s.sceneType === 'hook') ?? master[0];
  const cta = master.find((s) => s.sceneType === 'cta');
  const hookScene: ComposerScene = {
    ...hook,
    id: `cd6-${hook.id}`,
    orderIndex: 0,
    durationSeconds: 6,
    // Inject CTA call-to-action text on the hook frame for 6s-hook variants.
    textOverlay: {
      ...hook.textOverlay,
      text: cta?.textOverlay?.text || hook.textOverlay?.text || '',
      position: 'center',
      animation: 'scale-bounce',
      fontSize: 64,
      color: cta?.textOverlay?.color || hook.textOverlay?.color || '#FFFFFF',
      fontFamily: hook.textOverlay?.fontFamily,
    },
  };
  return {
    type,
    scenes: [hookScene],
    totalDurationSec: 6,
  };
}

export function buildAllCutdowns(
  master: ComposerScene[],
  types: CutdownType[],
): CutdownResult[] {
  return types.map((t) => buildCutdown(master, t));
}
