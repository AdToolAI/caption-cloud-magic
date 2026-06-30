/**
 * useCatalogLabel — Wave 3 UI helper.
 *
 * Resolves a catalog id (`framing.medium_close_up`, `mimik.warm_smile`, …)
 * to its localized label. Falls back to the raw free-text value when the
 * id is missing. Pure / no network — safe to call inline in render.
 *
 * The catalog itself is the single source of truth (`./index.ts`). This
 * module just adds a render-time hook + a small helper for badges so we
 * stop scattering `getCatalogLabel(...)` calls all over the UI.
 */
import { getCatalogLabel, type CatalogAxis } from './index';

export type CatalogLang = 'de' | 'en';

export interface CatalogChipResult {
  /** Display label for the badge — never empty (falls back to raw). */
  label: string;
  /** True when the value came from a Pass-C resolved catalog id. */
  fromCatalog: boolean;
  /** True when no value at all is available. */
  empty: boolean;
}

/**
 * Resolve a value pair `(id?, rawFreeText?)` into a displayable chip.
 *
 * Preference order:
 *   1. id  → catalog label (marks `fromCatalog: true`)
 *   2. raw → raw string fallback
 *   3. ''  → empty chip
 */
export function resolveCatalogChip(
  axis: CatalogAxis,
  id: string | null | undefined,
  raw: unknown,
  lang: CatalogLang = 'de',
): CatalogChipResult {
  if (id) {
    const label = getCatalogLabel(axis, id, lang);
    if (label) return { label, fromCatalog: true, empty: false };
  }
  if (raw != null && String(raw).trim()) {
    return { label: String(raw), fromCatalog: false, empty: false };
  }
  return { label: '—', fromCatalog: false, empty: true };
}

/**
 * Tiny React hook variant — keeps the call-site readable in JSX.
 */
export function useCatalogLabel(
  axis: CatalogAxis,
  id: string | null | undefined,
  raw: unknown,
  lang: CatalogLang = 'de',
): CatalogChipResult {
  return resolveCatalogChip(axis, id, raw, lang);
}
