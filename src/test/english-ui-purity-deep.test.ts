import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Deep English-UI purity guard (rebuilt).
 *
 * Contract: with English selected (the canonical default) no ordinary
 * creator-facing UI sink may render German copy. German is allowed only
 * inside explicit language branches (`tx({ de, en, es })`, `t(language, …)`,
 * `de:` / `es:` dictionary values, `language === 'de'` guards).
 *
 * The previous version of this guard was proven blind to
 *   (a) multi-line JSX text nodes,
 *   (b) German without umlauts / unknown compounds (no morphology),
 *   (c) German split across adjacent concatenated literals,
 *   (d) whole-file exclusions that also hid genuine copy,
 *   (e) sinks other than JSX text (placeholder/title/aria/alt, toasts,
 *       document.title, config display fields, sibling option arrays).
 *
 * This rebuild is sink-first, newline tolerant, morphology aware, joins
 * adjacent literals and uses range-scoped exclusions. The self-tests below
 * encode one negative control per proven blind spot.
 */

const SRC = path.resolve(__dirname, '..');

/**
 * Area policies — the only path-scoped exclusions that remain.
 * Each is a non-ordinary-UI surface, not a workaround for a detector gap.
 */
const AREA_POLICIES: Array<{ re: RegExp; reason: string }> = [
  { re: /^(components|pages)\/admin\//, reason: 'internal admin console (operator-only)' },
  { re: /^lib\/(translations|translationsFill|eventTranslations)\.ts$/, reason: 'language dictionaries' },
  { re: /^lib\/i18nText\.ts$/, reason: 'localisation helper itself' },
  { re: /^lib\/uiLocale\.ts$/, reason: 'locale helper itself' },
  { re: /^remotion\//, reason: 'render templates (baked video output, not UI chrome)' },
  { re: /^pages\/legal\//, reason: 'legal texts with their own jurisdiction language logic' },
  { re: /^pages\/Legal\.tsx$/, reason: 'German-jurisdiction terms (AGB/Datenschutz) with own language logic' },
  { re: /^components\/legal\//, reason: 'German-jurisdiction legal content blocks' },
];

/**
 * Sink-scoped allowlist. Every entry is justified as a non-ordinary-UI sink;
 * no entry may be ordinary creator-facing display copy.
 */
const ALLOWLIST: Record<string, string> = {
  'lib/video-composer/briefingTemplate.ts': 'German sample-briefing corpus (TEMPLATE_DE) beside TEMPLATE_EN/ES',
  'lib/directors-cut/overlayPresets.ts': 'category enum values (stable data keys) rendered via CATEGORY_LABEL map',
  'lib/suggestedTimes.ts': 'German-market scheduling heuristics, labels localized at render time',
  'hooks/useQuickPublish.ts': 'German keyword matching lists, not display copy',
  'lib/ai-video/spokenLanguage.ts': 'spoken-language endonyms',
  'lib/audiobook/manuscript.ts': 'language endonyms',
  'components/comments/ReplySuggestions.tsx': 'German reply corpus selected only for German comments',
};

const UML = /[äöüÄÖÜß]/;

const DE_FUNC = new Set(
  ('der die das den dem des ein eine einen einem einer und oder nicht kein keine mit von zu zum zur für auf aus bei nach ' +
    'über unter durch beim ist sind wird werden wurde du dein deine dich dir wir uns ihr sich als noch schon nur alle ' +
    'jede jeden diesen diesem dieser dieses im am ohne sowie damit dass weil wenn welche wieder sehr mehr auch bereits')
    .split(' '),
);

const DE_STEMS = [
  'erstell', 'lösch', 'loesch', 'speicher', 'bearbeit', 'hochlad', 'herunterlad', 'entfern', 'hinzufüg', 'hinzufueg',
  'abbrech', 'aktivier', 'deaktivier', 'auswähl', 'auswaehl', 'anzeig', 'einstellung', 'übersicht', 'uebersicht',
  'verfügbar', 'verfuegbar', 'fehlgeschlag', 'erfolgreich', 'generier', 'analysier', 'exportier', 'importier',
  'optimier', 'aktualisier', 'benachrichtig', 'empfehlung', 'einreich', 'veröffentlich', 'veroeffentlich',
  'verwend', 'verwalt', 'zurücksetz', 'zuruecksetz', 'wiederhol', 'sortier', 'bewert', 'beschreib',
  'sicherheit', 'berechtig', 'wiederkehrend', 'geschwindigkeit', 'lesbarkeit', 'empfindlichkeit', 'kostenpflichtig',
];

const DE_SUFFIX =
  /\b\p{L}{4,}(ung|ungen|keit|keiten|heit|heiten|schaft|schaften|lich|lichen|isch|ische|ischen|chen|lein|ieren|iert|ierte|ierung|barkeit)\b/iu;

const EN_MARK = new Set(
  ('the you your and with for is are was this that of to in on it we our they can not have has will from all more when ' +
    'where what how new create delete save edit upload download settings error success failed available preview scene ' +
    'video audio image ready start stop next back page each per only also just about into over under between click here')
    .split(' '),
);

/** Tokens that look German but are legitimate English/product terms. */
const NEUTRAL = new Set(
  ('in so an am hat war die international alt start medien team optional standard video videos pause links rot bald ' +
    'info intro outro logo demo beta pro plus mini max ok id url api ai ui ux cta seo hd fps px kb mb gb ms')
    .split(' '),
);

export function germanEvidence(raw: string): number {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length < 3) return 0;
  const words = text.match(/[\p{L}]{2,}/gu) ?? [];
  if (!words.length) return 0;
  const low = words.map((w) => w.toLowerCase());
  const en = low.filter((w) => EN_MARK.has(w)).length;
  const func = low.filter((w) => DE_FUNC.has(w) && !NEUTRAL.has(w)).length;
  const stems = low.filter((w) => !NEUTRAL.has(w) && DE_STEMS.some((s) => w.startsWith(s))).length;
  let ev = func * 2 + stems * 2;
  if (UML.test(text)) ev += 3;
  if (DE_SUFFIX.test(text)) ev += 2;
  if (en > 0 && ev <= en * 2) return 0;
  return ev;
}

export function isGerman(text: string): boolean {
  return germanEvidence(text) >= 4;
}

/* ------------------------------------------------------------------ */
/* Range-scoped safe zones                                             */
/* ------------------------------------------------------------------ */

type Range = [number, number];

function balanced(src: string, open: number): number {
  let d = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
    } else if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') {
      d--;
      if (d === 0) return i + 1;
    }
  }
  return src.length;
}

export function safeRanges(src: string): Range[] {
  const rs: Range[] = [];
  let m: RegExpExecArray | null;

  const call = /\b(tx|pickText|useTx\(\)|t)\s*\(/g;
  while ((m = call.exec(src))) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    if (open < 0) continue;
    if (m[1] === 't' && !/^\(\s*(language|lang|uiLang)\b/.test(src.slice(open, open + 24))) continue;
    rs.push([m.index, balanced(src, open)]);
  }

  const key = /(?<![\w$])(de|es|deDE|esES|de_DE|es_ES)\s*:/g;
  while ((m = key.exec(src))) {
    let i = m.index + m[0].length;
    let d = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "'" || c === '"' || c === '`') {
        const q = c;
        i++;
        while (i < src.length && src[i] !== q) {
          if (src[i] === '\\') i++;
          i++;
        }
      } else if ('([{'.includes(c)) d++;
      else if (')]}'.includes(c)) {
        if (d === 0) break;
        d--;
      } else if (c === ',' && d === 0) break;
    }
    rs.push([m.index, Math.min(i + 1, src.length)]);
  }

  const guard = /(language|lang\w*|uiLang\w*|locale\w*)\s*===\s*['"]de/g;
  while ((m = guard.exec(src))) rs.push([m.index, Math.min(src.length, m.index + 400)]);

  for (const re of [/\/\/[^\n]*/g, /\/\*[\s\S]*?\*\//g, /^import[^\n]*$/gm]) {
    while ((m = re.exec(src))) rs.push([m.index, m.index + m[0].length]);
  }

  const log = /console\.\w+\s*\(/g;
  while ((m = log.exec(src))) rs.push([m.index, balanced(src, src.indexOf('(', m.index))]);

  return rs;
}

const inSafe = (pos: number, rs: Range[]) => rs.some(([a, b]) => pos >= a && pos < b);
const lineOf = (src: string, pos: number) => src.slice(0, pos).split('\n').length;

/* ------------------------------------------------------------------ */
/* Sink extraction                                                     */
/* ------------------------------------------------------------------ */

export interface Sink {
  pos: number;
  text: string;
  kind: string;
}

const ATTRS =
  /\b(placeholder|title|aria-label|aria-description|alt|data-tooltip|label|helperText|description|caption|tooltip|emptyMessage|emptyState)\s*=\s*(?:"([^"\n]{2,300})"|'([^'\n]{2,300})'|\{\s*['"`]([^'"`\n]{2,300})['"`]\s*\})/g;

const FIELDS =
  /\b(label|labels|title|name|displayName|description|desc|hint|tagline|question|subtitle|helper|helperText|tooltip|placeholder|caption|message|heading|summary|cta|ctaLabel|badge|status|error|note|warning|answer|reply|text|body)\s*:\s*(?:'([^'\\\n]{3,300})'|"([^"\\\n]{3,300})"|`([^`$\\\n]{3,300})`)/g;

export function extractSinks(src: string): Sink[] {
  const out: Sink[] = [];
  let m: RegExpExecArray | null;

  // 1. JSX text nodes — newline tolerant (blind spot a).
  const jsxText = />([^<>{}]*?[\p{L}][^<>{}]*?)</gsu;
  while ((m = jsxText.exec(src))) {
    const text = m[1].replace(/\s+/g, ' ').trim();
    // Reject matches that are actually code between `>` and `<` (generics,
    // comparisons, arrow bodies) rather than a rendered text node.
    if (/(=>|===|!==|\breturn\b|;\s|\/\/|\bconst\b|\bRecord\b|\bfunction\b|\{|\})/.test(text)) continue;
    if (text.length >= 3) out.push({ pos: m.index + 1, text, kind: 'jsx-text' });
  }

  // 2. Text-rendering attributes.
  while ((m = ATTRS.exec(src))) {
    const text = (m[2] ?? m[3] ?? m[4] ?? '').replace(/\s+/g, ' ').trim();
    if (text.length >= 3) out.push({ pos: m.index, text, kind: `attr:${m[1]}` });
  }

  // 3. Object display fields (configs, catalogs, hook return values).
  while ((m = FIELDS.exec(src))) {
    const text = (m[2] ?? m[3] ?? m[4] ?? '').replace(/\s+/g, ' ').trim();
    if (text.length >= 3) out.push({ pos: m.index, text, kind: `field:${m[1]}` });
  }

  // 4. toast / dialog / document.title argument windows.
  const shout = /(toast[.\w]*\s*\(|document\.title\s*=|new Notification\s*\()/g;
  while ((m = shout.exec(src))) {
    const start = m.index;
    const seg = src.slice(start, start + 600);
    const lit = /['"]([^'"\\\n]{4,250})['"]/g;
    let s: RegExpExecArray | null;
    while ((s = lit.exec(seg))) {
      out.push({ pos: start + s.index, text: s[1].replace(/\s+/g, ' ').trim(), kind: 'toast' });
    }
  }

  // 5. Sibling string arrays (options, quickReplies, …).
  const arr = /\b(options|quickReplies|tags|items|steps|choices|suggestions|examples|bullets|features)\s*:\s*\[([^\]]{6,900})\]/g;
  while ((m = arr.exec(src))) {
    const body = m[2];
    const offset = m.index + m[0].indexOf(body);
    const lit = /['"]([^'"\\\n]{3,200})['"]/g;
    let s: RegExpExecArray | null;
    while ((s = lit.exec(body))) {
      out.push({ pos: offset + s.index, text: s[1].trim(), kind: `array:${m[1]}` });
    }
  }

  // 6. Static concatenation joining (blind spot c).
  const concat = /['"]([^'"\\\n]{2,120})['"]\s*\+\s*['"]([^'"\\\n]{2,120})['"]/g;
  while ((m = concat.exec(src))) {
    out.push({ pos: m.index, text: `${m[1]}${m[2]}`.replace(/\s+/g, ' ').trim(), kind: 'concat' });
  }

  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__' || e.name === 'test') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

export function scanRepo(): string[] {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    if (AREA_POLICIES.some((p) => p.re.test(rel))) continue;
    if (ALLOWLIST[rel]) continue;
    const src = fs.readFileSync(file, 'utf8');
    const rs = safeRanges(src);
    const seen = new Set<string>();
    for (const sink of extractSinks(src)) {
      if (inSafe(sink.pos, rs)) continue;
      if (!isGerman(sink.text)) continue;
      const key = `${lineOf(src, sink.pos)}:${sink.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offenders.push(`${rel}:${lineOf(src, sink.pos)} [${sink.kind}] ${sink.text.slice(0, 120)}`);
    }
  }
  return offenders;
}

/* ------------------------------------------------------------------ */
/* Self-tests — one negative control per proven blind spot             */
/* ------------------------------------------------------------------ */

describe('deep detector self-tests', () => {
  it('detects a multi-line JSX text node', () => {
    const src = `const A = () => (<p>\n  Erstelle automatisch wiederkehrende Events\n</p>);`;
    expect(extractSinks(src).some((s) => s.kind === 'jsx-text' && isGerman(s.text))).toBe(true);
  });

  it('detects a placeholder without umlauts', () => {
    const src = `<Input placeholder="Kurzbeschreibung des Produkts eingeben" />`;
    expect(extractSinks(src).some((s) => isGerman(s.text))).toBe(true);
  });

  it('detects sibling option arrays', () => {
    const src = `const q = { options: ['Werbung fuer die Marke', 'Bildung und Unterhaltung'] };`;
    expect(extractSinks(src).some((s) => isGerman(s.text))).toBe(true);
  });

  it('detects concatenated German', () => {
    const src = `const msg = 'Der Export ist ' + 'fehlgeschlagen und wurde abgebrochen';`;
    expect(extractSinks(src).some((s) => s.kind === 'concat' && isGerman(s.text))).toBe(true);
  });

  it('detects config display fields', () => {
    const src = `export const P = { id: 'x', label: 'Voiceover automatisch generieren' };`;
    expect(extractSinks(src).some((s) => s.kind.startsWith('field:') && isGerman(s.text))).toBe(true);
  });

  it('detects toast copy', () => {
    const src = `toast.success('Thumbnail wurde erfolgreich generiert');`;
    expect(extractSinks(src).some((s) => s.kind === 'toast' && isGerman(s.text))).toBe(true);
  });

  it('ignores German inside tx() branches', () => {
    const src = `<p>{tx({ de: 'Erstelle automatisch wiederkehrende Events', en: 'Create recurring events', es: 'Crear eventos' })}</p>`;
    const rs = safeRanges(src);
    expect(extractSinks(src).filter((s) => isGerman(s.text) && !inSafe(s.pos, rs))).toEqual([]);
  });

  it('ignores de:/es: dictionary values and language === "de" guards', () => {
    const src = `const M = { de: 'Einstellungen speichern', en: 'Save settings' };\nconst x = language === 'de' ? 'Alles zurücksetzen und abbrechen' : 'Cancel';`;
    const rs = safeRanges(src);
    expect(extractSinks(src).filter((s) => isGerman(s.text) && !inSafe(s.pos, rs))).toEqual([]);
  });

  it('does not flag ordinary English UI copy', () => {
    const src = `<p>Create automatically recurring events for your team</p>\n<Input placeholder="Enter a short product description" />`;
    expect(extractSinks(src).filter((s) => isGerman(s.text))).toEqual([]);
  });
});

describe('English UI purity (deep)', () => {
  it('has no EN-reachable German UI copy', () => {
    const offenders = scanRepo();
    expect(
      offenders,
      `${offenders.length} EN-reachable German UI residual(s) — wrap in tx({ de, en, es }):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
