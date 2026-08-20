import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * English-UI purity regression guard.
 *
 * Contract: when English is selected (the canonical default), ordinary
 * creator-facing UI must render English only. German/Spanish copy is allowed
 * exclusively inside explicit language branches (`tx({ de, en, es })`,
 * `t(language, de, en, es)`, `de:` / `es:` dictionary blocks).
 *
 * This test fails when a new bare German literal is introduced in a
 * creator-facing component, or when a fixed `de-DE` formatter reappears.
 */

const SRC = path.resolve(__dirname, '..');

const EXCLUDED_DIRS = [
  path.join(SRC, 'components', 'admin'),
  path.join(SRC, 'pages', 'admin'),
  path.join(SRC, 'test'),
];

const EXCLUDED_FILES = new Set(
  [
    'lib/translations.ts',
    'lib/translationsFill.ts',
    'lib/eventTranslations.ts',
    'lib/i18nText.ts',
    'lib/uiLocale.ts',
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

describe('English UI purity', () => {
  it('has no hardcoded de-DE locale formatting', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = fs.readFileSync(file, 'utf8');
      src.split('\n').forEach((line, idx) => {
        if (!/(toLocale(?:Date|Time)?String|Intl\.[A-Za-z]+Format)\(\s*['"]de-DE['"]/.test(line)) return;
        offenders.push(`${path.relative(SRC, file)}:${idx + 1}`);
      });
    }
    expect(offenders, `use uiLocale() instead of a fixed 'de-DE' locale:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('renders common action labels through the i18n helpers only', () => {
    // Short, high-traffic German UI labels that must never appear bare.
    const banned =
      /(?<![\w-])(Abbrechen|Speichern|Löschen|Bearbeiten|Herunterladen|Hochladen|Entfernen|Zurücksetzen|Übernehmen|Verwerfen|Fehlgeschlagen|Erfolgreich|Einstellungen|Hinzufügen|Schriftart)(?![\w-])/;
    const langBranch = /(tx\(|t\(\s*language|useTranslation|i18nText|\bde:\s|\bes:\s|\bde:\s*\{|\bes:\s*\{|language\s*===|lang\s*===)/;
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = fs.readFileSync(file, 'utf8');
      const lines = src.split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        if (!banned.test(line)) return;
        // Look further back so literals inside an explicit `de: {` / `es: {`
        // dictionary branch are not treated as bare labels.
        const context = lines.slice(Math.max(0, idx - 60), idx + 2).join('\n');
        if (langBranch.test(line) || langBranch.test(context)) return;
        offenders.push(`${path.relative(SRC, file)}:${idx + 1}: ${trimmed.slice(0, 100)}`);
      });
    }
    expect(offenders, `wrap these in tx({ de, en, es }):\n${offenders.join('\n')}`).toEqual([]);
  });
});
