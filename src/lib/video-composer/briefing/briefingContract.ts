/**
 * BriefingContract — shared shape between the `briefing-deep-parse` Edge
 * Function and the client. The server is the single authority: it detects
 * duration, scene count, continuous-scene flags and stamps this object onto
 * `plan._meta.debug.briefing_contract`.
 *
 * The client MUST prefer this object over any local re-detection when it
 * is present. Local detectors are only allowed as a fallback for legacy
 * plans that were produced before the server started stamping.
 */

export type BriefingContractSource =
  | 'explicit-briefing'
  | 'script'
  | 'board';

export type BriefingScriptTimingMode = 'FREETEXT' | 'SHOT_MARKERS' | 'SZENE_BLOCKS';

export interface BriefingContract {
  /** Canonical total video duration in seconds (sum of scenes). */
  durationSec: number | null;
  /** Canonical number of scenes in the plan. */
  sceneCount: number;
  /** True when the briefing explicitly stated the scene count. */
  explicitSceneCount: boolean;
  /** True when the briefing explicitly demanded a single continuous scene. */
  continuousScene: boolean;
  /** Which layer supplied the canonical numbers. */
  source: BriefingContractSource;
  /** Script timing mode detected by the server. */
  scriptTimingMode: BriefingScriptTimingMode;
  /** Number of shot markers detected (0 when free-text). */
  shots: number;
  /** Server pipeline version — used for debug chips. */
  pipelineVersion: string;
}

/** Safe extraction of the contract from an arbitrary plan meta object. */
export function readBriefingContract(plan: unknown): BriefingContract | null {
  const meta = (plan as any)?._meta;
  const debug = meta && typeof meta === 'object' ? (meta as any).debug : null;
  const c = debug && typeof debug === 'object' ? (debug as any).briefing_contract : null;
  if (!c || typeof c !== 'object') return null;
  const durationSec = typeof c.durationSec === 'number' && Number.isFinite(c.durationSec) ? c.durationSec : null;
  const sceneCount = typeof c.sceneCount === 'number' && Number.isFinite(c.sceneCount) ? c.sceneCount : 0;
  return {
    durationSec,
    sceneCount,
    explicitSceneCount: !!c.explicitSceneCount,
    continuousScene: !!c.continuousScene,
    source: (c.source as BriefingContractSource) ?? 'board',
    scriptTimingMode: (c.scriptTimingMode as BriefingScriptTimingMode) ?? 'FREETEXT',
    shots: typeof c.shots === 'number' ? c.shots : 0,
    pipelineVersion: typeof c.pipelineVersion === 'string' ? c.pipelineVersion : 'unknown',
  };
}
