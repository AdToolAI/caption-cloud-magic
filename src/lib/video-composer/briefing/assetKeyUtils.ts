/**
 * Canonical asset-key normalization used across the briefing pipeline.
 *
 * Turns free-form mention keys, character names, or location names into a
 * stable ASCII lowercase key used for lookup, dedup, and matching. Consolidates
 * what used to be 4 separate copies in:
 *   - ensurePlanEnsemble.ts
 *   - planCastDedup.ts
 *   - ProductionPlanSheet.tsx
 *   - and inline call sites elsewhere.
 *
 * The Sheet variant also stripped location-prefixes ("locationId@…", "ort@…")
 * before normalising — retained here behind `stripLocationPrefix: true` so
 * the Sheet keeps its behaviour.
 */
export function normalizeAssetKey(
  value?: string | null,
  opts?: { stripLocationPrefix?: boolean },
): string {
  let s = String(value ?? '').trim().replace(/^@/, '');
  if (opts?.stripLocationPrefix) {
    s = s.replace(/^(locationid|location|ort|place|setting)\s*@?\s*/i, '');
  }
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}
