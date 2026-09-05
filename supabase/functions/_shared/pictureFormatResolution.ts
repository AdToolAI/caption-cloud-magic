/**
 * Picture Studio — format resolution (SHARED, client + Edge Functions).
 *
 * Strict separation of two very different things:
 *
 *   requestedFormat  — the SEMANTIC choice of the user ("source" or "9:16").
 *                      Never mutated by a model switch.
 *   resolved*        — the TECHNICAL resolution for ONE concrete model.
 *                      Derived, disposable, recomputed on every model switch.
 *
 * "source" always carries the EXACT natural ratio of the primary reference
 * image (e.g. 3100x2100 -> 1.4761904...). It is never rounded to a preset at
 * upload time — only the capability registry of the selected model may
 * approximate it, and it must report that approximation back.
 *
 * A model's abilities are read exclusively from the verified capability
 * registry. Nothing here may be inferred from a model's name.
 */

import { capabilityFor, clampExact } from './pictureModelCapabilities.ts';

/** Sentinel value for "use the aspect ratio of the reference image". */
export const SOURCE_FORMAT = 'source';

export interface SourceDimensions {
  width: number;
  height: number;
}

export interface FormatAdjustment {
  /** What the user asked for, human readable ("Source 1.48:1" / "21:9"). */
  from: string;
  /** What this model actually gets ("3:2"). */
  to: string;
}

export interface ResolvedFormat {
  /** Echo of the semantic user choice — never overwritten. */
  requestedFormat: string;
  /** Supported ratio label handed to the provider. */
  aspectRatio: string;
  /** Only for models whose registry entry supports exact width/height. */
  width?: number;
  height?: number;
  /** Present only when the model could not honour the request exactly. */
  adjustment?: FormatAdjustment;
  /** `source` was requested but no usable reference dimensions exist. */
  sourceUnavailable?: boolean;
}

/** Ratio of a "W:H" label. Returns NaN for anything unparseable. */
export function ratioOfLabel(label: string): number {
  const [w, h] = label.split(':').map(Number);
  return w > 0 && h > 0 ? w / h : NaN;
}

/** Human readable label for a free ratio: 1.476190 -> "1.48:1". */
export function formatRatioLabel(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '—';
  return ratio >= 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
}

/** Registry-verified: does this model accept free width/height? */
export function supportsExactSize(tier: string): boolean {
  const cap = capabilityFor(tier);
  return cap?.sizing.kind === 'exact' && !!cap.sizing.exact;
}

/** Nearest supported ratio label for a free numeric ratio. */
export function nearestSupportedLabel(tier: string, ratio: number): string {
  const allowed = capabilityFor(tier)?.aspectRatios ?? ['1:1'];
  return allowed.reduce(
    (best, cand) =>
      Math.abs(ratioOfLabel(cand) - ratio) < Math.abs(ratioOfLabel(best) - ratio) ? cand : best,
    allowed[0],
  );
}

/** Valid, usable source dimensions? */
export function hasUsableSource(source?: SourceDimensions | null): source is SourceDimensions {
  return !!source && source.width > 0 && source.height > 0;
}

/**
 * Resolve the semantic format choice for ONE model.
 * Pure — no state, no side effects. The caller keeps `requestedFormat`.
 */
export function resolveRequestedFormat(
  tier: string,
  requestedFormat: string,
  source?: SourceDimensions | null,
): ResolvedFormat {
  const cap = capabilityFor(tier);
  const allowed = cap?.aspectRatios ?? ['1:1'];

  /* ---------------------------------------------------------- explicit ratio */
  if (requestedFormat !== SOURCE_FORMAT) {
    if (allowed.includes(requestedFormat)) {
      return { requestedFormat, aspectRatio: requestedFormat };
    }
    const target = ratioOfLabel(requestedFormat);
    const nearest = Number.isFinite(target) ? nearestSupportedLabel(tier, target) : allowed[0];
    return {
      requestedFormat,
      aspectRatio: nearest,
      adjustment: { from: requestedFormat, to: nearest },
    };
  }

  /* ------------------------------------------------------------------ source */
  if (!hasUsableSource(source)) {
    const fallback = allowed.includes('1:1') ? '1:1' : allowed[0];
    return { requestedFormat, aspectRatio: fallback, sourceUnavailable: true };
  }

  const exactRatio = source.width / source.height;
  const sourceLabel = `Source ${formatRatioLabel(exactRatio)}`;
  const nearest = nearestSupportedLabel(tier, exactRatio);

  // Model with verified exact-size support keeps the true ratio.
  if (supportsExactSize(tier)) {
    const e = cap!.sizing.exact!;
    let w = source.width;
    let h = source.height;

    const scaleUp = Math.max(e.minW / w, e.minH / h, 1);
    w *= scaleUp;
    h *= scaleUp;

    const maxPixels = e.maxMegapixels * 1_000_000;
    const scaleDown = Math.min(e.maxW / w, e.maxH / h, Math.sqrt(maxPixels / (w * h)), 1);
    w *= scaleDown;
    h *= scaleDown;

    return {
      requestedFormat,
      aspectRatio: nearest,
      width: clampExact(w, e.minW, e.maxW, e.step),
      height: clampExact(h, e.minH, e.maxH, e.step),
    };
  }

  // Ratio / preset / resolution model: approximate and say so.
  const drift = Math.abs(ratioOfLabel(nearest) - exactRatio);
  return {
    requestedFormat,
    aspectRatio: nearest,
    adjustment: drift > 0.005 ? { from: sourceLabel, to: nearest } : undefined,
  };
}
