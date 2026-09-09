/**
 * Brand context builders.
 *
 * These objects carry *generative* brand guidance into AI prompts.
 * Deterministic branding (logo, fonts, watermark, overlay colors) is applied
 * by the composer/templates and is deliberately NOT part of this object.
 */

export interface MotionStudioBrandContext {
  brandName?: string;
  styleDirection?: string;
  tone?: string;
  mood?: string;
  targetAudience?: string;
  keywords?: string[];
  values?: string[];
  /** Primary/secondary/accent — soft visual guidance only. */
  colors?: string[];
}

type AnyKit = Record<string, unknown> | null | undefined;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function strList(v: unknown, max: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const list = v
    .filter((x): x is string => typeof x === 'string' && !!x.trim())
    .map((x) => x.trim())
    .slice(0, max);
  return list.length ? list : undefined;
}

/**
 * Build the trimmed brand context that Motion Studio sends to scene/script
 * generation. Only fields that meaningfully steer *what happens on screen*
 * are included — fonts, logo URLs, hashtags, captions and emojis are not.
 */
export function buildMotionStudioBrandContext(kit: AnyKit): MotionStudioBrandContext | null {
  if (!kit) return null;

  const colors = [kit.primary_color, kit.secondary_color, kit.accent_color]
    .filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c));

  const ctx: MotionStudioBrandContext = {
    brandName: str(kit.brand_name),
    styleDirection: str(kit.style_direction),
    tone: str(kit.brand_tone),
    mood: str(kit.mood),
    targetAudience: str(kit.target_audience),
    keywords: strList(kit.keywords, 8),
    values: strList(kit.brand_values, 6),
    colors: colors.length ? colors : undefined,
  };

  const hasAny = Object.values(ctx).some((v) => v !== undefined);
  return hasAny ? ctx : null;
}
