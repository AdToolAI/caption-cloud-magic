/**
 * YouTube Shorts Metadata Optimizer
 *
 * Nutzt den existierenden youtube.upload Scope — kein neuer Review.
 * - Erkennt Shorts anhand aspectRatio (9:16) und Dauer (≤ 60s)
 * - Injiziert #Shorts in Title/Description
 * - Parst und formatiert Chapters (YouTube liest 0:00 Format automatisch)
 * - Wählt sinnvolle Category-ID
 */

export interface Chapter {
  timestamp: string; // "0:00" oder "1:23"
  label: string;
}

export interface ShortsMetadataInput {
  title: string;
  description: string;
  tags?: string[];
  aspectRatio?: string; // "9:16" | "1:1" | "16:9" …
  durationSec?: number;
  chapters?: Chapter[]; // strukturierte Chapters oder freeform in description
  categoryId?: string;
}

export interface ShortsMetadataOutput {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  isShort: boolean;
}

const YT_CATEGORY_DEFAULT = "22"; // People & Blogs

/**
 * Parst freeform chapter-Text ("0:00 Intro\n0:15 Hook") in Chapter[].
 * Gibt [] zurück wenn Format nicht erkannt wurde.
 */
export function parseChapters(freeform: string | undefined): Chapter[] {
  if (!freeform) return [];
  const lines = freeform.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: Chapter[] = [];
  for (const line of lines) {
    const m = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.{2,80})$/);
    if (m) out.push({ timestamp: m[1], label: m[2].trim() });
  }
  return out;
}

/**
 * Formatiert Chapters für die YouTube-Description.
 * YouTube braucht mindestens 3 Chapters mit erstem bei 0:00.
 */
export function formatChapters(chapters: Chapter[]): string {
  if (chapters.length < 3) return "";
  if (chapters[0].timestamp !== "0:00" && chapters[0].timestamp !== "00:00") return "";
  return chapters.map((c) => `${c.timestamp} ${c.label}`).join("\n");
}

export function isShortFormat(aspectRatio?: string, durationSec?: number): boolean {
  const arIsVertical = aspectRatio === "9:16" || aspectRatio === "vertical";
  const shortEnough = !durationSec || durationSec <= 60;
  return arIsVertical && shortEnough;
}

export function buildShortsMetadata(input: ShortsMetadataInput): ShortsMetadataOutput {
  const isShort = isShortFormat(input.aspectRatio, input.durationSec);
  const chapters = input.chapters ?? [];
  const chapterBlock = formatChapters(chapters);

  // Title: #Shorts anhängen wenn short-format und noch nicht enthalten
  let title = input.title.trim();
  if (isShort && !/#shorts/i.test(title)) {
    // 100 Zeichen Limit — kürzen falls nötig, aber Platz für " #Shorts" freihalten
    const maxBase = 100 - " #Shorts".length;
    if (title.length > maxBase) title = title.slice(0, maxBase - 1).trimEnd() + "…";
    title = `${title} #Shorts`;
  }

  // Description: Chapters + #Shorts-Zeile falls short
  let description = input.description.trim();
  if (chapterBlock) {
    description = `${description}\n\n${chapterBlock}`.trim();
  }
  if (isShort && !/#shorts/i.test(description)) {
    description = `${description}\n\n#Shorts`.trim();
  }

  // Tags: shorts + vertical für bessere Auffindbarkeit
  const tagSet = new Set((input.tags ?? []).map((t) => t.replace(/^#/, "").toLowerCase()));
  if (isShort) {
    tagSet.add("shorts");
    tagSet.add("shortvideo");
  }
  const tags = Array.from(tagSet).slice(0, 15); // YT limit

  return {
    title,
    description,
    tags,
    categoryId: input.categoryId || YT_CATEGORY_DEFAULT,
    isShort,
  };
}
