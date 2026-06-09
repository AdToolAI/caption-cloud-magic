/**
 * cinematicContinuityRules — heuristic continuity checker for consecutive
 * Composer scenes.
 *
 * Pure functions, zero side effects. Reads `scene.shotDirector` and
 * `scene.characterShot(s)` only. Returns warnings the Continuity Guardian
 * surfaces alongside its existing visual-drift score.
 *
 * MVP scope (Phase 3.2):
 *   • Reverse-shot detection (OTS-A → OTS-B)  → positive info chip
 *   • 180° line heuristic (two consecutive OTS from same angle family
 *     on the SAME character pair) → warn (likely line-cross)
 *   • Eyeline-match heuristic (low → high or vice versa on close-ups
 *     of same subject) → warn
 *   • Jump-cut detection (same framing + angle + subject) → warn
 *
 * Hard 180° rule enforcement requires a `screenDirection` enum that
 * doesn't exist yet — that's intentionally deferred. These rules are
 * heuristics: surfaced as hints, never blockers.
 */
import type { ComposerScene } from '@/types/video-composer';
import type { ShotSelection } from '@/config/shotDirector';

export type RuleSeverity = 'info' | 'warn';
export type RuleId =
  | 'reverse-shot-ok'
  | 'line-cross-likely'
  | 'eyeline-mismatch'
  | 'jump-cut';

export interface ContinuityWarning {
  rule: RuleId;
  severity: RuleSeverity;
  message: string;
  /** Suggested next-scene patch the user can apply with one click. */
  suggestedPatch?: Partial<ShotSelection>;
}

const OTS = 'over-shoulder';
const CLOSE_FRAMINGS = new Set(['close-up', 'extreme-close', 'medium-close']);

function getSubjectId(scene: ComposerScene): string | undefined {
  return (
    scene.characterShot?.characterId ??
    scene.characterShots?.[0]?.characterId
  );
}

function getSubjectIds(scene: ComposerScene): string[] {
  if (scene.characterShots?.length) {
    return scene.characterShots
      .map((c) => c.characterId)
      .filter((id): id is string => !!id);
  }
  return scene.characterShot?.characterId ? [scene.characterShot.characterId] : [];
}

function shotSummary(s: Partial<ShotSelection> | undefined): string {
  if (!s) return 'untyped';
  return `${s.framing ?? '·'}/${s.angle ?? '·'}/${s.movement ?? '·'}`;
}

/**
 * Run all heuristics on a (prev, next) pair. Order: positive signals first,
 * then warnings.
 */
export function runCinematicContinuityRules(
  prev: ComposerScene,
  next: ComposerScene,
): ContinuityWarning[] {
  const out: ContinuityWarning[] = [];
  const ps = (prev.shotDirector ?? {}) as ShotSelection;
  const ns = (next.shotDirector ?? {}) as ShotSelection;
  const prevSubjects = new Set(getSubjectIds(prev));
  const nextSubjects = new Set(getSubjectIds(next));
  const sharesAnySubject = [...prevSubjects].some((id) => nextSubjects.has(id));

  // 1. Reverse-shot OK (OTS-A → OTS-B, different primary subject)
  if (ps.angle === OTS && ns.angle === OTS) {
    const prevSubj = getSubjectId(prev);
    const nextSubj = getSubjectId(next);
    if (prevSubj && nextSubj && prevSubj !== nextSubj && (prevSubjects.has(nextSubj) || nextSubjects.has(prevSubj))) {
      out.push({
        rule: 'reverse-shot-ok',
        severity: 'info',
        message: 'Valid reverse-shot pair (OTS A → OTS B).',
      });
    } else if (prevSubj && nextSubj && prevSubj === nextSubj) {
      // Same subject + same OTS angle on consecutive cuts → likely line-cross
      out.push({
        rule: 'line-cross-likely',
        severity: 'warn',
        message:
          'Two consecutive over-the-shoulder shots on the same subject — risk of crossing the 180° line. Consider swapping to the reverse angle or a medium two-shot.',
        suggestedPatch: { angle: 'eye-level', framing: 'two-shot' },
      });
    }
  }

  // 2. Eyeline-mismatch — close-up on same subject with extreme angle flip.
  if (
    sharesAnySubject &&
    ps.framing && ns.framing &&
    CLOSE_FRAMINGS.has(ps.framing) && CLOSE_FRAMINGS.has(ns.framing)
  ) {
    const flipped =
      (ps.angle === 'low-angle' && ns.angle === 'high-angle') ||
      (ps.angle === 'high-angle' && ns.angle === 'low-angle') ||
      (ps.angle === 'worms-eye' && ns.angle === 'birds-eye') ||
      (ps.angle === 'birds-eye' && ns.angle === 'worms-eye');
    if (flipped) {
      out.push({
        rule: 'eyeline-mismatch',
        severity: 'warn',
        message: `Eyeline flip on close-ups of the same subject (${ps.angle} → ${ns.angle}). Match the angle or insert a neutral cutaway.`,
        suggestedPatch: { angle: ps.angle as string },
      });
    }
  }

  // 3. Jump-cut — identical framing + angle on identical primary subject.
  const prevSubj = getSubjectId(prev);
  const nextSubj = getSubjectId(next);
  if (
    prevSubj && nextSubj && prevSubj === nextSubj &&
    ps.framing && ns.framing && ps.framing === ns.framing &&
    ps.angle && ns.angle && ps.angle === ns.angle
  ) {
    out.push({
      rule: 'jump-cut',
      severity: 'warn',
      message: `Identical shot (${shotSummary(ps)}) repeated on the same subject — reads as a jump cut. Vary framing or angle.`,
      suggestedPatch:
        ps.framing === 'close-up'
          ? { framing: 'medium' }
          : { framing: 'close-up' },
    });
  }

  return out;
}

/**
 * Tooltip-friendly label for each rule (localized).
 */
export const RULE_LABELS: Record<RuleId, { en: string; de: string; es: string }> = {
  'reverse-shot-ok': {
    en: 'Reverse-shot OK',
    de: 'Reverse-Shot ok',
    es: 'Plano contraplano OK',
  },
  'line-cross-likely': {
    en: '180° line risk',
    de: '180°-Achse riskant',
    es: 'Riesgo de eje 180°',
  },
  'eyeline-mismatch': {
    en: 'Eyeline mismatch',
    de: 'Blickachse passt nicht',
    es: 'Eje de mirada incorrecto',
  },
  'jump-cut': {
    en: 'Jump cut',
    de: 'Jump Cut',
    es: 'Corte salto',
  },
};
