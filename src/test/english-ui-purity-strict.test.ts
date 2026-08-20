import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Strict English-UI purity companion guard.
 *
 * The original `english-ui-purity` test used a 60-line lookback window when
 * deciding whether a German literal sits inside an explicit language branch.
 * That window is far too generous: German display values inside config arrays
 * (`tags`, `tagline`, `category`), toast titles, template-literal fragments and
 * raw `.labelDe` / `.hintDe` renders all slipped through because *some* nearby
 * line happened to contain a `tx(` call.
 *
 * This guard is deliberately line-local: a banned German word is an offender
 * unless the very same line performs a language selection.
 */

const SRC = path.resolve(__dirname, '..');

const EXCLUDED_DIRS = [
  path.join(SRC, 'components', 'admin'),
  path.join(SRC, 'pages', 'admin'),
  path.join(SRC, 'test'),
];

const EXCLUDED_FILES = new Set(
  [
    // Translation dictionaries and i18n plumbing.
    'lib/translations.ts',
    'lib/translationsFill.ts',
    'lib/eventTranslations.ts',
    'lib/i18nText.ts',
    'lib/uiLocale.ts',
    // Explicit single-language template / prompt resources.
    'lib/video-composer/briefingTemplate.ts',
    // Dev-only demo surface, not ordinary creator UI.
    'pages/FeatureFlagDemo.tsx',
  ].map((p) => path.join(SRC, p)),
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.some((d) => full === d || full.startsWith(d + path.sep))) continue;
      if (entry.name === '__tests__') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      if (EXCLUDED_FILES.has(full)) continue;
      out.push(full);
    }
  }
  return out;
}

const FILES = walk(SRC);

/** Same-line language selection — the only accepted escape hatch. */
const LANG_SELECT =
  /(\btx\(|\buseTx\b|pickText\(|\bde:\s|\bes:\s|language\s*===|[Ll]ang\s*===|locale\s*===|\bt\(\s*['"]|TriText|\bcap\(|\bentry\()/;

/** Non-UI lines: comments, logging, imports. */
function isIgnorableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  if (/^\{\s*\/\*.*\*\/\s*\}$/.test(trimmed)) return true; // JSX comment, never rendered
  if (/\bconsole\.(log|debug|info|warn|error)\b/.test(trimmed)) return true;
  if (/^import\s|^export\s+\*|^export\s+\{/.test(trimmed)) return true;
  return false;
}

/**
 * Vocabulary of German words confirmed to have leaked into the English UI as
 * bare display literals (status labels, template tags, step hints, taglines,
 * interpolated fragments, badge categories).
 */
const BANNED_WORDS = [
  'Aktiv',
  'Inaktiv',
  'ausgewählt',
  'Rückgängig',
  'hinzugefügt',
  'Schnell',
  'Schneller',
  'Schnellster',
  'Energetisch',
  'Professionell',
  'Authentisch',
  'Rhythmisch',
  'Intensiv',
  'Kreativ',
  'Informativ',
  'Ruhig',
  'Fokussiert',
  'Geplant',
  'Entwurf',
  'Erweitert',
  'Stil',
  'Feintuning',
  'Störer',
  'Schild',
  'Marke',
  'Zitat',
  'Versionen',
  'Prüfung',
  'fehlend',
  'doppelt',
  'Übergang',
  'übersprungen',
  'Ziel',
  'Zielgruppe',
  'Tonalität',
  'Bewegungen',
  'Gesichter',
  'natives',
  'nachgeladen',
  'übernommen',
  'Charaktere',
  'ältere',
  'Ältere',
];

const BANNED = new RegExp(`(?<![\\w-])(${BANNED_WORDS.join('|')})(?![\\w-])`);

/**
 * Stable INTERNAL semantic identifiers that happen to be German words. These are
 * never rendered raw: each has a localized display mapping at its render site
 * (verified by hand). Renaming them would change filter keys / persisted values,
 * so the value stays German and only the label is localized.
 *
 * This list must only ever contain non-UI identifiers — never display copy.
 */
const SEMANTIC_GERMAN_IDS = new Set<string>([
  // Director's Cut overlay categories — filter keys, localized via
  // OVERLAY_CATEGORY_LABELS in OverlayLibrary.tsx.
  "lib/directors-cut/overlayPresets.ts::category: 'Lower Third' | 'Banner' | 'Störer' | 'Schild' | 'CTA' | 'Ticker' | 'Marke' | 'Callout' | 'Zitat' | 'Info' | 'Text';",
  "lib/directors-cut/overlayPresets.ts::category: 'Marke',",
  "lib/directors-cut/overlayPresets.ts::category: 'Schild',",
  "lib/directors-cut/overlayPresets.ts::category: 'Störer',",
  "lib/directors-cut/overlayPresets.ts::category: 'Zitat',",
  // Picture Studio mood chip ids — localized via CHIP_LABELS at render.
  "components/picture-studio/PromptHelperDialog.tsx::const MOODS = ['Episch', 'Ruhig', 'Dramatisch', 'Hell', 'Düster', 'Verspielt'];",
]);

/**
 * Explicit language-branch analysis (block aware).
 *
 * A German literal is legitimate when it lives inside an explicit `de:` / `de =`
 * branch of a per-language copy object, or inside a fixed tri-language tuple.
 * The original guard only looked at the *same* line, which forced a 100+ entry
 * allowlist. These two analyses replace that allowlist with real structure.
 */
function deBranchLines(src: string): Set<number> {
  const lines = src.split('\n');
  const inside = new Set<number>();
  let depth: number | null = null;
  let running = 0;
  let templateDe = false;

  lines.forEach((line, idx) => {
    // `de: \`multi-line template\`` — everything up to the closing backtick is
    // the German branch of a tx()/copy object.
    if (templateDe) {
      inside.add(idx);
      if (/`/.test(line)) templateDe = false;
      return;
    }
    if (/(^|[^\w.])de:\s*`[^`]*$/.test(line)) {
      templateDe = true;
      return;
    }

    // `language === 'de'` / `lang === 'de'` on the previous line, German value
    // on the next line of a multi-line ternary.
    const prev = lines[idx - 1] ?? '';
    if (/^\s*\?/.test(line) && /[Ll]ang(uage)?\s*===\s*['"]de['"]/.test(prev)) {
      inside.add(idx);
      return;
    }

    const opens = (line.match(/[{[]/g) ?? []).length;
    const closes = (line.match(/[}\]]/g) ?? []).length;
    if (depth === null && /(^|[^\w.])de\s*[:=]\s*[{[]\s*$/.test(line)) {
      depth = running + opens - closes;
      running += opens - closes;
      return;
    }
    running += opens - closes;
    if (depth !== null) {
      if (running < depth) depth = null;
      else inside.add(idx);
    }
  });
  return inside;
}

/** Middle member of a `[ "en", "de", "es" ]` / `[ "de", "en", "es" ]` tuple. */
function triTupleLines(src: string): Set<number> {
  const lines = src.split('\n');
  const inside = new Set<number>();
  const isStringOnly = (l: string) => /^\s*(['"`]).*\1,?\s*$/.test(l);
  const singleLineTuple =
    /\[\s*(['"])(?:\\.|(?!\1).)*\1\s*,\s*(['"])(?:\\.|(?!\2).)*\2\s*,\s*(['"])(?:\\.|(?!\3).)*\3\s*,?\s*\]/;
  lines.forEach((l, i) => {
    if (singleLineTuple.test(l)) inside.add(i);
  });
  for (let i = 0; i < lines.length; i++) {
    if (!/\[\s*$/.test(lines[i])) continue;
    const a = lines[i + 1];
    const b = lines[i + 2];
    const c = lines[i + 3];
    const close = lines[i + 4];
    if (!a || !b || !c || !close) continue;
    if (!isStringOnly(a) || !isStringOnly(b) || !isStringOnly(c)) continue;
    if (!/^\s*\]/.test(close)) continue;
    inside.add(i + 1);
    inside.add(i + 2);
    inside.add(i + 3);
  }
  return inside;
}

function key(rel: string, line: string): string {
  return `${rel}::${line.trim().slice(0, 140)}`;
}

function scan(predicate: (line: string) => boolean): string[] {
  const offenders: string[] = [];
  for (const file of FILES) {
    const src = fs.readFileSync(file, 'utf8');
    const deLines = deBranchLines(src);
    const tupleLines = triTupleLines(src);
    src.split('\n').forEach((line, idx) => {
      if (isIgnorableLine(line)) return;
      if (deLines.has(idx) || tupleLines.has(idx)) return;
      if (!predicate(line)) return;
      const rel = path.relative(SRC, file);
      if (SEMANTIC_GERMAN_IDS.has(key(rel, line))) return;
      offenders.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
  return offenders;
}

describe('English UI purity (strict, line-local)', () => {
  it('has no bare German display literals outside same-line language selection', () => {
    const offenders = scan((line) => BANNED.test(line) && !LANG_SELECT.test(line));
    expect(
      offenders,
      `bare German UI literals — wrap in tx({ de, en, es }):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('never renders raw .labelDe / .hintDe / .descriptionDe in ordinary UI', () => {
    const offenders = scan((line) => /\.(labelDe|hintDe|descriptionDe|titleDe|textDe)\b/.test(line));
    expect(
      offenders,
      `raw German-only display fields rendered without language selection:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('has no German values in non-language display config fields', () => {
    // `tagline`, `tags`, `category`, `label`, `hint` assigned a bare German
    // string literal (no tx()/de:/es: on the same line).
    const configField =
      /\b(tagline|tags|category|label|hint|title|description)\s*:\s*(\[[^\]]*)?['"`][^'"`]*['"`]/;
    const offenders = scan(
      (line) => configField.test(line) && BANNED.test(line) && !LANG_SELECT.test(line),
    );
    expect(
      offenders,
      `German display config values must be localized:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('has no German fragments in variables interpolated into all tx() variants', () => {
    // Pattern: `const x = cond ? ` … German … ` : ''` assigned outside tx().
    const offenders = scan(
      (line) =>
        /^\s*(const|let)\s+\w+\s*=/.test(line) &&
        /[`'"][^`'"]*\$\{/.test(line) &&
        BANNED.test(line) &&
        !LANG_SELECT.test(line),
    );
    expect(
      offenders,
      `localize the fragment before interpolating it into every language variant:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
