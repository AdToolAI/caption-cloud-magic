/**
 * Manuskript-Verarbeitung für den Hörbuch-Modus.
 * Reine Frontend-Logik: Kapitel-Erkennung, Sprecher-Zuordnung, Kosten.
 */

export const AUDIOBOOK_LANGUAGES = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'tr', label: 'Türkçe' },
] as const;

export type AudiobookLanguage = (typeof AUDIOBOOK_LANGUAGES)[number]['code'];

/** €-Preis pro 1.000 Zeichen — muss zu render-audiobook passen. */
export const PRICE_PER_1K_CHARS = 0.30;

/** Kinder-/Vorlese-Preset. */
export const AUDIOBOOK_VOICE_PRESET = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.35,
  speed: 0.95,
};

export interface AudiobookVoiceRef {
  voiceId: string;
  voiceName: string;
}

export interface AudiobookCast {
  narrator: AudiobookVoiceRef | null;
  characters: Array<AudiobookVoiceRef & { name: string }>;
}

export interface ParsedChapter {
  title: string;
  body: string;
}

export interface ManuscriptSegment {
  /** Figurenname oder null für den Erzähler. */
  speaker: string | null;
  text: string;
}

const HEADING_RE = /^(?:#{1,3}\s+.+|(?:kapitel|chapter|capítulo|chapitre|capitolo|hoofdstuk|rozdział|bölüm)\s+[\dIVXLC]+.*)$/i;

/** Zerlegt einen Fließtext in Kapitel — an Überschriften, sonst ein Kapitel. */
export function parseChapters(raw: string): ParsedChapter[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const lines = text.split('\n');
  const chapters: ParsedChapter[] = [];
  let current: ParsedChapter | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && HEADING_RE.test(trimmed)) {
      if (current) chapters.push(current);
      current = { title: trimmed.replace(/^#{1,3}\s+/, '').slice(0, 120), body: '' };
      continue;
    }
    if (!current) current = { title: 'Kapitel 1', body: '' };
    current.body += line + '\n';
  }
  if (current) chapters.push(current);

  return chapters
    .map((c, i) => ({ title: c.title || `Kapitel ${i + 1}`, body: c.body.trim() }))
    .filter((c) => c.body.length > 0);
}

/**
 * Teilt einen Kapiteltext in Absätze und erkennt `Figur: Text`-Dialogzeilen.
 * Unbekannte oder fehlende Präfixe landen beim Erzähler.
 */
export function parseSegments(body: string, characterNames: string[]): ManuscriptSegment[] {
  const known = new Map(characterNames.map((n) => [n.trim().toLowerCase(), n]));
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const match = paragraph.match(/^([\p{L}\p{N} .'-]{1,40}):\s*([\s\S]+)$/u);
      if (match) {
        const candidate = known.get(match[1].trim().toLowerCase());
        if (candidate) return { speaker: candidate, text: match[2].trim() };
      }
      return { speaker: null, text: paragraph };
    });
}

export interface RenderSegment {
  voiceId: string;
  voiceName?: string;
  text: string;
}

/** Übersetzt Absätze in Render-Segmente mit konkreten Voice-IDs. */
export function buildRenderSegments(
  body: string,
  cast: AudiobookCast,
): { segments: RenderSegment[]; missingVoices: string[] } {
  const names = cast.characters.map((c) => c.name);
  const parsed = parseSegments(body, names);
  const missing = new Set<string>();
  const segments: RenderSegment[] = [];

  for (const seg of parsed) {
    const ref = seg.speaker
      ? cast.characters.find((c) => c.name === seg.speaker)
      : cast.narrator;
    if (!ref?.voiceId) {
      missing.add(seg.speaker ?? 'Erzähler');
      continue;
    }
    segments.push({ voiceId: ref.voiceId, voiceName: ref.voiceName, text: seg.text });
  }

  return { segments, missingVoices: [...missing] };
}

export function countChars(text: string): number {
  return text.trim().length;
}

/** Kosten in € für eine Zeichenmenge. */
export function estimateCostEuros(chars: number): number {
  return Math.round((chars / 1000) * PRICE_PER_1K_CHARS * 100) / 100;
}

/** Kosten in Credits (100 Cr = 1 €). */
export function estimateCostCredits(chars: number): number {
  return Math.round(estimateCostEuros(chars) * 100);
}

/** Grobe Laufzeit in Sekunden (~1.000 Zeichen ≈ 60 s Vorlesetempo). */
export function estimateDurationSeconds(chars: number): number {
  return Math.round((chars / 1000) * 60);
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')} h`;
  return `${m}:${String(sec).padStart(2, '0')} min`;
}
