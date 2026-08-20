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
// `t(language, '<de>', '<en>', '<es>')` is the sanctioned file-local positional
// tri-language helper. It is an explicit language selection, exactly like
// `tx({de,en,es})`, so its German first argument is a DE branch — not a leak.
// Requires the language argument, so a plain `t('key')` lookup is unaffected.
const POSITIONAL_TRI = /\bt\(\s*(language|lang)\b\s*,/;

const LANG_SELECT =
  /(\btx\(|\buseTx\b|pickText\(|\bde:\s|\bes:\s|language\s*===|[Ll]ang\s*===|locale\s*===|\bt\(\s*['"]|\bt\(\s*(language|lang)\b\s*,|TriText|\bcap\(|\bentry\()/;

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
  // v-final: wider vocabulary class found by the independent secondary scan
  // (variant labels, speaker/face mapping, Remotion error fallback, portrait
  // fallback name). Each of these leaked while EN was selected.
  'Variante',
  'Varianten',
  'Variantenname',
  'Sprecher',
  'Gesicht',
  'Gesichter',
  'zuordnen',
  'Auswahlen',
  'gefunden',
  'Verfügbare',
  'Portrait fehlt',
  // v-final-15: analytics winner/selection copy, music toast, shot hints.
  'Gewinner',
  'passende',
  'Gegenlicht',
  'statt',
  'Generiere',
  'Suche',
  // v-final-14: auth-gated onboarding / media / studio residual class.
  'Loslegen',
  'umstimmen',
  'Erstelltes',
  'gesendet',
  'Schnell-Filter',
  'Kurz-Variante',
  'Emotionaler',
  'Kernbotschaft',
  'Rendering-Optionen',
  'Channel-Ziel',
  'Musik-Bibliothek',
  'Korrektur',
  'Korrekturen',
  'Briefing passt',
  // v-final-6: comments reply toasts/tooltips, preflight severity label,
  // Director's Cut library column header, comments tab label, reset-password
  // placeholder. Semantic values (`fragen` tab id) stay untouched.
  'Antwort',
  'Antworten',
  'kopiert',
  'kopieren',
  'Warnung',
  'Warnungen',
  'Bibliothek',
  'Fragen',
  'Passwort',
  'Passwörter',
  'wiederholen',
  // `Neu` is deliberately NOT a bare banned word (it collides with identifiers
  // and English "Neural"). It is caught contextually by the rule below.
];

/**
 * Contextual `Neu` detection: only where it is unambiguously rendered copy —
 * a JSX text node, a quoted display string, or a `Neu (…)` / `Neu <participle>`
 * phrase. Keeps identifiers like `isNeu`, `neuralNet`, `neuePosts` out.
 */
const NEU_CONTEXT =
  /(>\s*Neu[\s(<]|["'`]\s*Neu\s*\(|["'`]Neu\s+(geplant|hinzugefügt|erstellt|verfügbar)|>\s*Neu\s*<)/;


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
  // Persisted production-plan cast defaults. `mentionKey` / `characterName` are
  // matching keys written into the plan and compared against briefing mentions;
  // translating them would break speaker↔cast resolution. Never rendered raw as
  // a label — the UI shows the matched cast name or a localized fallback.
  "components/video-composer/briefing/ProductionPlanSheet.tsx::mentionKey: `S${String(sceneIndex).padStart(2, '0')} Sprecher`,",
  "components/video-composer/briefing/ProductionPlanSheet.tsx::characterName: 'Sprecher',",
  "components/video-composer/briefing/ProductionPlanSheet.tsx::mentionKey: slot.mentionKey || `S${String(sceneIndex).padStart(2, '0')} Sprecher`,",
  "components/video-composer/briefing/ProductionPlanSheet.tsx::characterName: slot.characterName || 'Sprecher',",
  "components/video-composer/briefing/ProductionPlanSheet.tsx::characterName: matched?.name ?? speakerLabel.get(k) ?? 'Sprecher',",
  "components/video-composer/briefing/ProductionPlanSheet.tsx::mentionKey: matched?.name ?? dialogTurns[turnIndex].speakerMentionKey ?? 'Sprecher',",
  "components/video-composer/briefing/ProductionPlanSheet.tsx::characterName: matched?.name ?? 'Sprecher',",
  "components/video-composer/briefing/ProductionPlanSheet.tsx::if (!isRealSpeakerTurn(turn)) return; // Blocklabels sind keine Sprecher.",
  "hooks/useApplyProductionPlan.ts::mentionKey: `S${String(sceneIndex).padStart(2, '0')} Sprecher`,",
  "hooks/useApplyProductionPlan.ts::characterName: 'Sprecher',",
  "hooks/useApplyProductionPlan.ts::? { ...sourceCast, mentionKey: sourceCast.mentionKey || `S${String(scene.index).padStart(2, '0')} Sprecher` }",
  // Trailing code comments, never rendered.
  "hooks/useGenerateAllClips.ts::isLipSyncIntentional(scene as any) || // v430.1 Schritt 2B — SSoT statt cinematic-sync-Teilcheck",
  "remotion/templates/ExplainerVideo.tsx::solution: 'celebrating',   // Charakter feiert (Lösung gefunden)",
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

/**
 * German-language signal for free-form strings: umlauts/eszett, or a German
 * function word / typical German label morphology. Deliberately narrow so
 * English and Spanish label values do not trip it.
 */
const GERMAN_SIGNAL =
  /[äöüßÄÖÜ]|(?<![\w-])(der|die|das|den|dem|des|ein|eine|einen|einem|einer|und|oder|mit|ohne|f\u00fcr|von|zum|zur|auf|aus|bei|nach|nicht|kein|keine|dein|deine|mein|meine|wird|werden|sind|ist|nur|mehr|neue|neuer|neues|alle|jede|jeder|Erstellen|Bearbeiten|L\u00f6schen|Speichern|Hinzuf\u00fcgen|Ausw\u00e4hlen|Weiter|Zur\u00fcck|Abbrechen)(?![\w-])/;

function scan(predicate: (line: string, rel: string) => boolean): string[] {
  const offenders: string[] = [];
  for (const file of FILES) {
    const src = fs.readFileSync(file, 'utf8');
    const deLines = deBranchLines(src);
    const tupleLines = triTupleLines(src);
    src.split('\n').forEach((line, idx) => {
      if (isIgnorableLine(line)) return;
      if (deLines.has(idx) || tupleLines.has(idx)) return;
      const rel = path.relative(SRC, file);
      if (!predicate(line, rel)) return;
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

  it('flags contextual `Neu` rendered as display copy', () => {
    const offenders = scan((line) => NEU_CONTEXT.test(line) && !LANG_SELECT.test(line));
    expect(
      offenders,
      `German "Neu" rendered as UI copy — wrap in tx({ de, en, es }):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('has no German label-like values in src/lib and src/config data modules', () => {
    // Data modules feed labels straight into UI (chips, categories, tiles).
    // A German string assigned to a label-like key there is a leak unless it
    // is an explicit DE branch, a tri-language tuple, or a proven semantic id.
    const labelField =
      /\b(label|title|name|description|desc|hint|tagline|tooltip|placeholder|caption|subtitle|summary|cta|badge|tags|category)\s*:\s*(\[[^\]]*)?['"`]([^'"`]{3,})['"`]/;
    const offenders = scan((line, rel) => {
      if (!/^(lib|config)[\\/]/.test(rel)) return false;
      if (LANG_SELECT.test(line)) return false;
      // Language tables list endonyms (Türkçe, Português, Français). Non-ASCII
      // there is the language's own spelling, not German copy.
      if (/\b(code|locale|flag|iso|bcp47)\s*:\s*['"`]/.test(line)) return false;
      const m = labelField.exec(line);
      if (!m) return false;
      return GERMAN_SIGNAL.test(m[3]);
    });
    expect(
      offenders,
      `German label values in data modules must be localized (tx / TriText):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

