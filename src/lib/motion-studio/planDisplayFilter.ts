/**
 * planDisplayFilter — sanitizer for Production Plan script display/persistence.
 *
 * Filters out "directive" lines (style adjectives, timing notes, structural
 * markers, AUTO-DIRECTOR headers) so the customer sees only real spoken
 * dialog. Callers decide whether to use this only for display or before
 * persisting a dialogScript.
 */

const DIRECTIVE_MARKERS = [
  /auto[-\s]?director/i,
  /synthesize\s+full\s+screenplay/i,
  /full\s+screenplay\s+from\s+briefing/i,
  /take\s+[a-z]\s+aufnehmen/i,
  /shot\s+pro\s+zeile/i,
];

const STRUCTURAL_PATTERNS = [
  /^\d+\s*sekunden?$/i,
  /^0\s*bis\s*\d+\s*sekunden?$/i,
  /^\d+\s*(bis|to|-)\s*\d+\s*(sekunden?|seconds?)$/i,
  /^\d+\s*(hauptfigur(en)?|durchgehende\s*szene|sprecher|shot(s)?|block|szene)\b/i,
  /^\d+\s*(main\s+character|continuous\s+scene|speakers?|shots?|scenes?)\b/i,
];

const ACTION_DIRECTIVE_PATTERNS = [
  /^(eine|ein|a|an)\s+.*\b(szene|scene)\b.*\b(zeigen|show|depict|soll|should)\b/i,
  /\b(eine|ein|a|an)\s+.*\b(szene|scene)\b.*\b(wird|is|are)\s+(gezeigt|shown|depicted)\b/i,
  /^fokus\s+auf\b/i,
  /^focus\s+on\b/i,
  /^(kein|keine|ohne|no)\s+.*\b(gore|brutalität|brutality|violence|comic|game[-\s]?look|stil|style|unnötig|unnecessary|explizit|explicit)\b/i,
  /\b(trümmergeräusche|debris\s+sounds|sound\s+design|negative\s+prompt)\b/i,
];

// Common German style adjectives typically emitted as bare tone descriptors.
const STYLE_ADJECTIVES = new Set([
  'düster', 'duster', 'intensiv', 'realistisch', 'hochwertig', 'cinematic',
  'cinematisch', 'dramatisch', 'episch', 'ruhig', 'energetisch', 'modern',
  'minimalistisch', 'elegant', 'stylish', 'dark', 'moody', 'bright', 'clean',
  'gritty', 'polished', 'raw', 'atmosphärisch', 'atmospharisch',
]);

function isStyleAdjectiveChain(text: string): boolean {
  const trimmed = text.trim().replace(/[.!?]+$/, '');
  if (trimmed.length === 0 || trimmed.length > 80) return false;
  // Split on comma/slash/–/—/·
  const tokens = trimmed
    .split(/[,/–—·]| und | oder /i)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0 || tokens.length > 6) return false;
  // Every token must be a single word AND a known style adjective
  return tokens.every((t) => !/\s/.test(t) && STYLE_ADJECTIVES.has(t));
}

function isFragment(text: string): boolean {
  const trimmed = text.trim();
  // Fragments starting with connector words and very short
  if (/^(oder|und|or|and)\s+/i.test(trimmed)) {
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount <= 4) return true;
  }
  return false;
}

export function isDirectiveTurn(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return true; // empty turn = noise
  if (DIRECTIVE_MARKERS.some((r) => r.test(t))) return true;
  if (STRUCTURAL_PATTERNS.some((r) => r.test(t))) return true;
  if (ACTION_DIRECTIVE_PATTERNS.some((r) => r.test(t))) return true;
  if (isStyleAdjectiveChain(t)) return true;
  if (isFragment(t)) return true;
  return false;
}

export function sanitizeDialogScript(script: string | null | undefined): string {
  if (!script) return '';
  return script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const match = line.match(/^([^:\n]{1,96}):\s*(.*)$/);
      const spokenText = match ? match[2]?.trim() : line;
      return !isDirectiveTurn(spokenText);
    })
    .join('\n');
}

export interface VisibleTurnsResult<T> {
  visible: Array<{ turn: T; originalIndex: number }>;
  hiddenCount: number;
}

export function getVisibleTurns<T extends { text?: string }>(
  turns: readonly T[] | null | undefined,
): VisibleTurnsResult<T> {
  const arr = Array.isArray(turns) ? turns : [];
  const visible: Array<{ turn: T; originalIndex: number }> = [];
  let hiddenCount = 0;
  arr.forEach((turn, originalIndex) => {
    if (isDirectiveTurn(turn?.text)) {
      hiddenCount += 1;
    } else {
      visible.push({ turn, originalIndex });
    }
  });
  return { visible, hiddenCount };
}
