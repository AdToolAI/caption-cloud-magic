/**
 * Publish-Handoff — ein einziger Übergabevertrag zwischen "Export fertig"
 * und dem Content Command Center (Composer / Kalender).
 *
 * Bewusst über Storage statt Router-State: Der Composer liest den Schlüssel
 * `composer_import` bereits seit jeher, der Kalender `calendar_prefill`.
 * So bleibt genau ein Format im Umlauf.
 */

export type PublishMediaType = "image" | "video" | "audio";

export interface PublishHandoff {
  mediaUrl: string;
  mediaType: PublishMediaType;
  thumbnailUrl?: string;
  title?: string;
  caption?: string;
  hashtags?: string[];
  aspectRatio?: string;
  platforms?: string[];
  /** Herkunft, nur für Telemetrie/Debug. */
  source: string;
}

export const COMPOSER_IMPORT_KEY = "composer_import";
export const CALENDAR_PREFILL_KEY = "calendar_prefill";

/** Gültigkeit des Handoffs — identisch zur Composer-Import-Logik. */
export const HANDOFF_TTL_MS = 5 * 60 * 1000;

export function writeComposerHandoff(handoff: PublishHandoff) {
  const payload = {
    mediaUrl: handoff.mediaUrl,
    mediaType: handoff.mediaType,
    thumbnailUrl: handoff.thumbnailUrl,
    text: handoff.caption ?? "",
    caption: handoff.caption ?? "",
    hashtags: handoff.hashtags ?? [],
    platforms: handoff.platforms ?? [],
    aspectRatio: handoff.aspectRatio,
    source: handoff.source,
    timestamp: Date.now(),
  };
  sessionStorage.setItem(COMPOSER_IMPORT_KEY, JSON.stringify(payload));
}

export function writeCalendarHandoff(handoff: PublishHandoff) {
  const payload = {
    title: handoff.title || `Post ${new Date().toLocaleDateString()}`,
    caption: handoff.caption ?? "",
    mediaUrl: handoff.mediaUrl,
    mediaType: handoff.mediaType,
    platforms: handoff.platforms ?? [],
    source: handoff.source,
    timestamp: Date.now(),
  };
  sessionStorage.setItem(CALENDAR_PREFILL_KEY, JSON.stringify(payload));
}

/** Leitet ein Seitenverhältnis aus Breite/Höhe ab (für Kanal-Hinweise). */
export function deriveAspectRatio(width?: number, height?: number): string | undefined {
  if (!width || !height) return undefined;
  const ratio = width / height;
  if (Math.abs(ratio - 9 / 16) < 0.05) return "9:16";
  if (Math.abs(ratio - 1) < 0.05) return "1:1";
  if (Math.abs(ratio - 4 / 5) < 0.05) return "4:5";
  if (Math.abs(ratio - 16 / 9) < 0.05) return "16:9";
  return `${width}:${height}`;
}
