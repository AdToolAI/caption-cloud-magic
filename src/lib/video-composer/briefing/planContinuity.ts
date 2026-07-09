/**
 * Continuity heuristic — should the previous scene's cast/location carry
 * forward when this scene didn't specify its own?
 *
 * Consolidated from two previously identical implementations:
 *   - useApplyProductionPlan.ts:shouldInheritPlanContinuity
 *   - ProductionPlanSheet.tsx:shouldInheritContinuity
 */
import type { TPlanScene } from './productionPlan';

export function shouldInheritContinuity(
  scene: TPlanScene,
  axis: 'cast' | 'location',
): boolean {
  const haystack = [
    scene.continuityHint,
    scene.anchorPromptEN,
    scene.label,
    scene.beat,
    scene.voiceover?.text,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (axis === 'cast') {
    return (
      scene.lipSync ||
      !!scene.voiceover?.text ||
      !!scene.dialogTurns?.length ||
      /(same|gleiche|gleichen|selbe|derselbe|avatar|founder|sprecher|speaker|charakter|character)/i.test(
        haystack,
      )
    );
  }
  return /(same|gleiche|gleichen|selbe|derselbe|desk|location|ort|setting|home\s*office|büro|office)/i.test(
    haystack,
  );
}
