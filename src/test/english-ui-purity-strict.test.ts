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
  /(\btx\(|\buseTx\b|pickText\(|\bde:\s|\bes:\s|language\s*===|lang\s*===|locale\s*===|\bt\(\s*['"]|TriText)/;

/** Non-UI lines: comments, logging, imports. */
function isIgnorableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
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
  'Elegant',
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

function scan(predicate: (line: string) => boolean): string[] {
  const offenders: string[] = [];
  for (const file of FILES) {
    const src = fs.readFileSync(file, 'utf8');
    src.split('\n').forEach((line, idx) => {
      if (isIgnorableLine(line)) return;
      if (!predicate(line)) return;
      offenders.push(`${path.relative(SRC, file)}:${idx + 1}: ${line.trim().slice(0, 140)}`);
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
