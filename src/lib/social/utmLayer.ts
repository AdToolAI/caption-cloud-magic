/**
 * UTM Tracking Layer
 *
 * Rewrites URLs in captions/descriptions with plattform-spezifische UTM-Parametern
 * damit Analytics-Attribution automatisch funktioniert.
 *
 * Kein neuer Plattform-Review nötig — reine Client-Logik.
 */

export type UtmPlatform =
  | "instagram"
  | "instagram-story"
  | "tiktok"
  | "linkedin"
  | "youtube"
  | "x"
  | "facebook"
  | "threads";

const PLATFORM_SOURCE: Record<UtmPlatform, string> = {
  instagram: "instagram",
  "instagram-story": "instagram",
  tiktok: "tiktok",
  linkedin: "linkedin",
  youtube: "youtube",
  x: "x",
  facebook: "facebook",
  threads: "threads",
};

const PLATFORM_MEDIUM: Record<UtmPlatform, string> = {
  instagram: "social-reels",
  "instagram-story": "social-story",
  tiktok: "social-video",
  linkedin: "social-post",
  youtube: "social-shorts",
  x: "social-post",
  facebook: "social-post",
  threads: "social-post",
};

const URL_REGEX = /\bhttps?:\/\/[^\s<>"']+/gi;

export interface UtmOptions {
  campaign?: string; // z.B. "beta-launch"
  content?: string; // z.B. Video-ID / Post-Slug
  overrideExisting?: boolean; // Default: false — respektiert bestehende utm_*
}

/**
 * Hängt UTM-Parameter an alle absoluten URLs in text an.
 * IDs bleiben stabil, damit derselbe Link auf verschiedenen Kanälen
 * unterschiedlich attribuiert wird.
 */
export function injectUtmParams(
  text: string | undefined | null,
  platform: UtmPlatform,
  opts: UtmOptions = {},
): string {
  if (!text) return text ?? "";
  const source = PLATFORM_SOURCE[platform];
  const medium = PLATFORM_MEDIUM[platform];
  const campaign = opts.campaign?.trim() || "adtool-social";
  const content = opts.content?.trim();

  return text.replace(URL_REGEX, (match) => {
    try {
      const url = new URL(match);
      const setIfMissing = (key: string, value: string) => {
        if (opts.overrideExisting || !url.searchParams.has(key)) {
          url.searchParams.set(key, value);
        }
      };
      setIfMissing("utm_source", source);
      setIfMissing("utm_medium", medium);
      setIfMissing("utm_campaign", campaign);
      if (content) setIfMissing("utm_content", content);
      return url.toString();
    } catch {
      return match; // ungültige URL → nicht anfassen
    }
  });
}

/**
 * Slugify für utm_campaign — a-z0-9-, max 60 Zeichen.
 */
export function toCampaignSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
