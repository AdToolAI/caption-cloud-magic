import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeFile,
  findHalfLocalized,
  findModuleScopeLocalization,
  isGerman,
  isSpanish,
  isEnglishSentence,
  type Finding,
} from './lib/triLocaleDetector';
import { translations } from '@/lib/translations';
import { translationsFill } from '@/lib/translationsFill';

/**
 * Permanent tri-locale purity guard.
 *
 * Symmetric successor of the English-only guard: it protects EN, DE and ES
 * equally.
 *
 *   EN mode — no bare German/Spanish in ordinary creator-facing sinks.
 *   DE mode — no English sentences or Spanish copy inside `de:` branches.
 *   ES mode — no English sentences or German copy inside `es:` branches.
 *   Parity  — every dictionary key resolves in all three locales.
 *   Shape   — no half-localized `tx({…})` maps, no module-scope localization.
 */

const SRC = path.resolve(__dirname, '..');

/** Whole surfaces that are not ordinary creator UI. */
const AREA_POLICIES: Array<{ re: RegExp; reason: string }> = [
  { re: /^(components|pages)\/admin\//, reason: 'internal operator console' },
  { re: /^lib\/(translations|translationsFill|eventTranslations)\.ts$/, reason: 'language dictionaries' },
  { re: /^lib\/i18nText\.ts$/, reason: 'localisation helper itself' },
  { re: /^lib\/uiLocale\.ts$/, reason: 'locale helper itself' },
  { re: /^remotion\//, reason: 'baked video render templates, not UI chrome' },
  { re: /^pages\/legal\//, reason: 'German-jurisdiction legal track, handled separately' },
  { re: /^pages\/Legal\.tsx$/, reason: 'German-jurisdiction legal track, handled separately' },
  { re: /^components\/legal\//, reason: 'German-jurisdiction legal track, handled separately' },
  { re: /^test\//, reason: 'test corpora and fixtures' },
];

/**
 * Sink-scoped exceptions ONLY: file + exact literal, each a proven
 * non-display sink (semantic identifiers, provider keys, endonyms).
 * Path-level trust is deliberately impossible here.
 */
const ALLOWLIST: Record<string, Array<{ text: string; reason: string }>> = {
  'components/video-composer/briefing/ProductionPlanSheet.tsx': [
    { text: 'Sprecher', reason: 'server-plan cast-slot key, matched not rendered' },
  ],
  'hooks/useApplyProductionPlan.ts': [
    { text: 'Sprecher', reason: 'server-plan cast-slot key on the apply path' },
  ],
  'components/creator-library/MusicBrowser.tsx': [
    { text: 'fröhlich', reason: 'semantic mood search key in track metadata' },
  ],
  'components/video-composer/VoiceSubtitlesTab.tsx': [
    { text: 'Bebas Neue', reason: 'CSS font-family name in FONT_FAMILIES, identical in every locale' },
  ],
  'lib/directors-cut/overlayPresets.ts': [
    { text: 'Sarah Klein', reason: 'sample person name inside a lower-third preset, not translatable copy' },
  ],
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = walk(SRC).filter((f) => {
  const rel = path.relative(SRC, f).split(path.sep).join('/');
  return !AREA_POLICIES.some((p) => p.re.test(rel));
});

interface Hit extends Finding {
  file: string;
}

const HITS: Hit[] = [];
for (const file of FILES) {
  const rel = path.relative(SRC, file).split(path.sep).join('/');
  const src = fs.readFileSync(file, 'utf8');
  const allowed = new Set((ALLOWLIST[rel] ?? []).map((a) => a.text));
  for (const f of analyzeFile(src, file.endsWith('.tsx'), allowed)) HITS.push({ ...f, file: rel });
}

const fmt = (hs: Hit[]) => hs.map((h) => `${h.file}:${h.line} [${h.kind}] ${h.as}: ${h.text}`).join('\n');

/* ------------------------------------------------------------------ */
/* Detector trust                                                      */
/* ------------------------------------------------------------------ */

describe('tri-locale detector trust', () => {
  /** 22 sink fixtures: every extraction path must still catch a planted leak. */
  const SINK_FIXTURES: Array<[string, string]> = [
    ['jsx text', '<p>Video wird erstellt</p>'],
    ['jsx multiline', '<p>\n  Deine Szene wurde gespeichert\n</p>'],
    ['attr placeholder', '<input placeholder="Titel eingeben" />'],
    ['attr aria-label', '<button aria-label="Szene löschen" />'],
    ['attr alt', '<img alt="Vorschaubild der Szene" />'],
    ['attr title', '<span title="Nicht verfügbar" />'],
    ['attr expression', '<input placeholder={"Beschreibung hinzufügen"} />'],
    ['field label', 'const o = { label: "Alle Szenen anzeigen" };'],
    ['field description', 'const o = { description: "Erstellt automatisch Untertitel" };'],
    ['field title', 'const o = { title: "Einstellungen gespeichert" };'],
    ['field hint', 'const o = { hint: "Bitte wähle eine Stimme" };'],
    ['toast success', 'toast.success("Szene erfolgreich gespeichert");'],
    ['toast error', 'toast.error("Upload fehlgeschlagen");'],
    ['array options', 'const x = { options: ["Alle Szenen", "Nur Entwürfe"] };'],
    ['array plain', 'const steps = ["Briefing erstellen", "Szenen generieren"];'],
    ['ternary consequent', 'const s = ok ? "Gespeichert" : "Fehlgeschlagen";'],
    ['fallback ||', 'const s = value || "Keine Beschreibung vorhanden";'],
    ['template literal', 'const s = `${n} Szenen wurden generiert`;'],
    ['concat', 'const s = "Bitte " + "warte einen Moment";'],
    ['document.title', 'document.title = "Meine Medienbibliothek";'],
    ['spanish jsx', '<p>La escena se ha guardado correctamente</p>'],
    ['spanish field', 'const o = { label: "Seleccionar plantilla de campaña" };'],
  ];

  it('detects a planted leak in all 22 sink shapes', () => {
    const missed = SINK_FIXTURES.filter(([, src]) => analyzeFile(src, true).length === 0).map(([n]) => n);
    expect(SINK_FIXTURES.length).toBe(22);
    expect(missed, `sinks with no detection:\n${missed.join('\n')}`).toEqual([]);
  });

  it('flags every historical real leak in the regression corpus', () => {
    const corpus: string[] = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures', 'german-leak-corpus.json'), 'utf8'),
    );
    const missed = corpus.filter((t) => !isGerman(t));
    expect(corpus.length).toBeGreaterThan(150);
    expect(missed, `corpus entries no longer detected:\n${missed.join('\n')}`).toEqual([]);
  });

  it('keeps German and Spanish regression fixtures classified correctly', () => {
    const DE_FIXTURES = [
      'Szene wurde erfolgreich gespeichert',
      'Bitte wähle zuerst eine Stimme aus',
      'Alle Entwürfe anzeigen',
      'Lippensynchronisation läuft',
      'Guthaben aufgebraucht',
      'Vorlage verwenden',
    ];
    const ES_FIXTURES = [
      'La escena se ha guardado correctamente',
      'Selecciona primero una voz',
      'Mostrar todos los borradores',
      'No se pudo generar la campaña',
      'Créditos agotados',
      'Vista previa de la plantilla',
    ];
    expect(DE_FIXTURES.filter((t) => !isGerman(t))).toEqual([]);
    expect(ES_FIXTURES.filter((t) => !isSpanish(t))).toEqual([]);
    // …and must not be confused with each other.
    expect(DE_FIXTURES.filter((t) => isSpanish(t))).toEqual([]);
    expect(ES_FIXTURES.filter((t) => isGerman(t))).toEqual([]);
  });

  it('does not flag legitimate English UI or product loanwords', () => {
    const CLEAN = [
      'Generate your first video',
      'Upload starten', // German copy with an English loanword — legitimate DE
      'Login',
      'Español',
      'Deutsch',
      'Seedance 2.5',
      'Elemente', // German plural, not a Spanish -mente adverb
    ];
    expect(CLEAN.filter((t) => isEnglishSentence(t) && t !== 'Generate your first video')).toEqual([]);
    expect(isGerman('Generate your first video')).toBe(false);
    expect(isSpanish('Elemente')).toBe(false);
    expect(isGerman('Español')).toBe(false);
  });

  /* Regressions for detector bugs fixed in the convergence gate. */

  it('does not lose sink classes across consecutive files (regex lastIndex)', () => {
    // Module-level /g regexes used to keep `lastIndex` between analyzeFile
    // calls, so the same leak was found in file 1 and missed in file 2.
    const file = '<input placeholder="Titel eingeben" />';
    const first = analyzeFile(file, true);
    const second = analyzeFile(file, true);
    const third = analyzeFile('const o = { label: "Alle Szenen anzeigen" };', false);
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBe(first.length);
    expect(third.length).toBeGreaterThan(0);
  });

  it('treats "leer" as German alone but as Spanish "to read" in a sentence', () => {
    expect(isGerman('leer')).toBe(true);
    expect(isGerman('Leer un guion')).toBe(false);
    expect(isGerman('No se pudo leer el briefing')).toBe(false);
    expect(isGerman('Leer reglas')).toBe(false);
  });

  it('ignores semantic IDs that a tri-locale label map translates', () => {
    const src = [
      "const GOALS = ['Werbung', 'Szene'];",
      'const CHIP_LABELS = {',
      "  Werbung: { de: 'Werbung', en: 'Advertising', es: 'Publicidad' },",
      "  Szene: { de: 'Szene', en: 'Scene', es: 'Escena' },",
      '};',
    ].join('\n');
    expect(analyzeFile(src, false)).toEqual([]);
    // …but an untranslated German array entry is still a leak.
    expect(analyzeFile("const GOALS = ['Werbung', 'Szene anzeigen'];", false).length).toBeGreaterThan(0);
  });

  it('covers short one-word labels and document.title sinks', () => {
    expect(analyzeFile('document.title = "Meine Medienbibliothek";', false).length).toBeGreaterThan(0);
    expect(analyzeFile('<span>Titel</span>', true).length).toBeGreaterThan(0);
  });
});


/* ------------------------------------------------------------------ */
/* Cross-locale contamination                                          */
/* ------------------------------------------------------------------ */

describe('tri-locale UI purity', () => {
  it('renders no German or Spanish in ordinary sinks while English is selected', () => {
    const hits = HITS.filter((h) => h.mode === 'en');
    expect(hits, `bare DE/ES copy in EN mode (${hits.length}):\n${fmt(hits)}`).toEqual([]);
  });

  it('keeps German branches free of English sentences and Spanish copy', () => {
    const hits = HITS.filter((h) => h.mode === 'de');
    expect(hits, `foreign copy inside de: branches (${hits.length}):\n${fmt(hits)}`).toEqual([]);
  });

  it('keeps Spanish branches free of English sentences and German copy', () => {
    const hits = HITS.filter((h) => h.mode === 'es');
    expect(hits, `foreign copy inside es: branches (${hits.length}):\n${fmt(hits)}`).toEqual([]);
  });

  it('has no half-localized tx() maps', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      for (const h of findHalfLocalized(fs.readFileSync(file, 'utf8'))) {
        offenders.push(`${rel}: missing ${h.missing.join('/')} — ${h.text.replace(/\s+/g, ' ')}`);
      }
    }
    expect(offenders, `tx() maps missing a locale:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('introduces no module-scope localization calls (ratchet)', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      for (const h of findModuleScopeLocalization(fs.readFileSync(file, 'utf8'))) {
        offenders.push(`${rel}:${h.line}: ${h.text}`);
      }
    }
    // Module scope freezes the language at import time: the in-app switch
    // cannot update it. Wrap the call in a component/callback instead.
    expect(offenders, `move these into render scope:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('keeps sink exceptions scoped and small', () => {
    for (const [file, entries] of Object.entries(ALLOWLIST)) {
      for (const e of entries) {
        expect(e.reason.length, `${file} needs a reason`).toBeGreaterThan(20);
      }
    }
    expect(Object.values(ALLOWLIST).flat().length).toBeLessThanOrEqual(8);
  });
});

/* ------------------------------------------------------------------ */
/* Dictionary parity                                                   */
/* ------------------------------------------------------------------ */

describe('tri-locale dictionary parity', () => {
  const deepMerge = (target: any, source: any) => {
    for (const [k, v] of Object.entries(source ?? {})) {
      if (v && typeof v === 'object' && !Array.isArray(v)) deepMerge((target[k] ??= {}), v);
      else if (!(k in target)) target[k] = v;
    }
    return target;
  };
  const keys = (o: any, prefix = '', out: string[] = []) => {
    for (const [k, v] of Object.entries(o ?? {})) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) keys(v, p, out);
      else out.push(p);
    }
    return out;
  };
  const resolved = (l: 'en' | 'de' | 'es') =>
    new Set(keys(deepMerge(structuredClone((translations as any)[l] ?? {}), (translationsFill as any)[l] ?? {})));

  const en = resolved('en');
  const de = resolved('de');
  const es = resolved('es');

  it('resolves every English key in German', () => {
    const missing = [...en].filter((k) => !de.has(k));
    expect(missing, `missing German keys (${missing.length}):\n${missing.join('\n')}`).toEqual([]);
  });

  it('resolves every English key in Spanish', () => {
    const missing = [...en].filter((k) => !es.has(k));
    expect(missing, `missing Spanish keys (${missing.length}):\n${missing.join('\n')}`).toEqual([]);
  });

  it('resolves every German and Spanish key in English', () => {
    const missing = [...new Set([...de, ...es])].filter((k) => !en.has(k));
    expect(missing, `missing English keys (${missing.length}):\n${missing.join('\n')}`).toEqual([]);
  });
});
