/**
 * catalogAdapters — bidirectional mapping between legacy editor enums
 * (`PerformanceExpression/Gesture/Gaze`, `ShotSelection` option-ids) and
 * the Wave-1 Catalog-ID-Registry (`src/lib/video-composer/catalog`).
 *
 * Why this exists:
 *   • The Storyboard editors keep their typed enum / option-id systems for
 *     UX stability (PresetGrid thumbnails, type-safe dropdowns, existing
 *     tests). The Catalog-ID-Registry is the canonical mapping layer
 *     between Briefing-Plan and Storyboard.
 *   • Every editor write goes through one of these adapters so the shadow
 *     `*Id` fields (e.g. `mimikId`, `framingId`) stay in lock-step with the
 *     user choice — drift between Briefing-Plan and Storyboard is impossible.
 *
 * Zero pipeline impact: render/prompt code keeps reading the legacy
 * free-text mirror fields. The shadow IDs are write-through metadata for
 * the Briefing-Plan-Sheet and SceneCard chip surfaces.
 */
import { resolveCatalogId, getCatalogEntry, type CatalogAxis } from '@/lib/video-composer/catalog';
import type {
  PerformanceExpression,
  PerformanceGesture,
  PerformanceGaze,
} from '@/types/video-composer';

// ─── Performance enums ──────────────────────────────────────────────────────

const EXPRESSION_TO_CATALOG: Record<PerformanceExpression, string> = {
  neutral: 'mimik.neutral',
  'warm-smile': 'mimik.warm_smile',
  curious: 'mimik.curious',
  concerned: 'mimik.concerned',
  confident: 'mimik.confident',
  surprised: 'mimik.surprised',
};
const GESTURE_TO_CATALOG: Record<PerformanceGesture, string> = {
  still: 'gestik.still',
  'hand-on-chin': 'gestik.hands_explain', // closest analogue
  'open-palms': 'gestik.open_palms',
  point: 'gestik.point_to_camera',
  'cross-arms': 'gestik.arms_crossed',
  'lean-in': 'gestik.lean_forward',
};
const GAZE_TO_CATALOG: Record<PerformanceGaze, string> = {
  'to-camera': 'blick.to_camera',
  'to-speaker': 'blick.at_partner',
  away: 'blick.away',
  'down-thinking': 'blick.down',
};

export function expressionToCatalogId(v: PerformanceExpression | undefined | null): string | null {
  return v ? EXPRESSION_TO_CATALOG[v] ?? null : null;
}
export function gestureToCatalogId(v: PerformanceGesture | undefined | null): string | null {
  return v ? GESTURE_TO_CATALOG[v] ?? null : null;
}
export function gazeToCatalogId(v: PerformanceGaze | undefined | null): string | null {
  return v ? GAZE_TO_CATALOG[v] ?? null : null;
}

// ─── Shot Director option-ids ───────────────────────────────────────────────
// Legacy ids live in `src/config/shotDirector.ts` and are kebab-case strings
// like `medium-close-up`. Catalog ids are snake_case with axis prefix.
// We rely on the catalog's fuzzy `resolveCatalogId` for synonym-matching so
// new options added to either side don't need a hand-maintained map.

const SHOT_AXIS_MAP: Record<string, CatalogAxis> = {
  framing: 'framing',
  angle: 'angle',
  movement: 'movement',
  lighting: 'lighting',
  // `camera` / `lens` legacy categories don't have a canonical catalog axis
  // yet (Wave 1 ships 11 axes; camera-body / lens-roll are not modelled).
  // resolveShotOptionToCatalogId returns null for those — safe no-op.
};

export function resolveShotOptionToCatalogId(
  category: string,
  optionId: string | null | undefined,
): string | null {
  if (!optionId) return null;
  const axis = SHOT_AXIS_MAP[category];
  if (!axis) return null;
  return resolveCatalogId(axis, optionId);
}

/**
 * Hydrate the legacy engine-hint free-text for a catalog id. Used by the
 * Briefing-Plan-Apply hook to keep the free-text mirror consistent with
 * the resolved id when the original mirror is empty.
 */
export function engineHintFor(axis: CatalogAxis, id: string | null | undefined): string | null {
  const e = getCatalogEntry(axis, id);
  return e?.engine_hint ?? null;
}
