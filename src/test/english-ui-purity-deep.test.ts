import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Deep English-UI purity guard (rebuild #2).
 *
 * Contract: with English selected (the canonical default) no ordinary
 * creator-facing UI sink may render German copy. German is allowed only
 * inside explicit language branches (`tx({ de, en, es })`, `t(language, …)`,
 * `de:` / `es:` dictionary values, the consequent of a `language === 'de'`
 * guard).
 *
 * Proven miss patterns this rebuild must not repeat:
 *   (a) multi-line JSX text nodes,
 *   (b) short German-exclusive labels ("Verwenden", "Starten", "Ergebnisse")
 *       scoring below a fixed evidence threshold,
 *   (c) mixed strings ("Template verwenden") vetoed because an English token
 *       was present,
 *   (d) a blind fixed 400-character safe zone after `language === 'de'`
 *       swallowing adjacent English UI,
 *   (e) German split across adjacent concatenated literals / interpolations,
 *   (f) malformed nested `tx()` rendering literal source text,
 *   (g) file-wide allowlisting that also hid genuine creator UI.
 */

const SRC = path.resolve(__dirname, '..');

/* ------------------------------------------------------------------ */
/* Area policies — whole non-ordinary-UI surfaces only                 */
/* ------------------------------------------------------------------ */

export const AREA_POLICIES: Array<{ re: RegExp; reason: string }> = [
  { re: /^(components|pages)\/admin\//, reason: 'internal operator console' },
  { re: /^lib\/(translations|translationsFill|eventTranslations)\.ts$/, reason: 'language dictionaries' },
  { re: /^lib\/i18nText\.ts$/, reason: 'localisation helper itself' },
  { re: /^lib\/uiLocale\.ts$/, reason: 'locale helper itself' },
  { re: /^remotion\//, reason: 'baked video render templates, not UI chrome' },
  { re: /^pages\/legal\//, reason: 'legal texts with their own jurisdiction language logic' },
  { re: /^pages\/Legal\.tsx$/, reason: 'German-jurisdiction terms with own language logic' },
  { re: /^components\/legal\//, reason: 'German-jurisdiction legal content blocks' },
];

/**
 * Sink-scoped allowlist — file + exact literal. Re-derived from first
 * principles; every entry is a proven non-display sink. No path-level trust,
 * no genuine UI copy. Six previously allowlisted files were dropped because
 * they no longer produce any hit.
 */
export const ALLOWLIST: Record<string, Array<{ text: string; reason: string }>> = {
  'components/video-composer/briefing/ProductionPlanSheet.tsx': [
    { text: 'Sprecher', reason: 'plan cast-slot mention key (`S01 Sprecher`) matched against the server plan — semantic identifier, not display copy' },
  ],
  'hooks/useApplyProductionPlan.ts': [
    { text: 'Sprecher', reason: 'same plan cast-slot mention key on the apply path' },
  ],
  'components/creator-library/MusicBrowser.tsx': [
    { text: 'fröhlich', reason: 'semantic mood search key matched against track metadata, never rendered' },
  ],
  'components/picture-studio/PromptHelperDialog.tsx': [
    { text: 'Szene', reason: 'stable semantic chip ID; the rendered label comes from CHIP_LABELS' },
    { text: 'Hell', reason: 'stable semantic chip ID; the rendered label comes from CHIP_LABELS' },
    { text: ', Szene:', reason: 'object-literal key run inside CHIP_LABELS, not JSX text' },
    { text: ', Hell:', reason: 'object-literal key run inside CHIP_LABELS, not JSX text' },
  ],
  'components/video-composer/VoiceSubtitlesTab.tsx': [
    { text: 'Bebas Neue', reason: 'font-family proper noun in the subtitle font picker' },
  ],
  'lib/directors-cut/overlayPresets.ts': [
    { text: 'Sarah Klein', reason: 'sample persona proper noun inside preset demo content' },
  ],
};

/* ------------------------------------------------------------------ */
/* German-vs-English scoring                                           */
/* ------------------------------------------------------------------ */

const UML = /[äöüÄÖÜß]/;

/**
 * German-exclusive tokens. Deliberately includes short imperatives and
 * nominals — one of these alone is enough, so "Verwenden", "Starten" or
 * "Ergebnisse" cannot slip through on length.
 */
const DE_WORDS = new Set(
  (
    'kaufen kaufe kauf teilen teile ausblenden einblenden verwenden verwende verwendet nutzen nutze ' +
    'starten startet gestartet ergebnis ergebnisse lade laden lädt geladen kosten vergleich vergleichen ' +
    'danke nein sprecher sprecherin farbe farben fehlt fehlen fehlend fehlende erstellen erstelle erstellt ' +
    'löschen lösche gelöscht loeschen speichern speichere speichert gespeichert bearbeiten bearbeite ' +
    'hochladen hochgeladen herunterladen entfernen entferne entfernt hinzufügen hinzufuegen abbrechen ' +
    'abgebrochen aktivieren aktiviert deaktivieren deaktiviert auswählen auswaehlen ausgewählt anzeigen ' +
    'angezeigt einstellungen übersicht uebersicht verfügbar verfuegbar fehlgeschlagen erfolgreich ' +
    'generieren generiert exportieren importieren optimieren aktualisieren benachrichtigung empfehlung ' +
    'empfehlungen einreichen veröffentlichen veroeffentlichen verwalten verwalte zurücksetzen wiederholen ' +
    'sortieren bewerten beschreiben beschreibung sicherheit berechtigung geschwindigkeit lesbarkeit ' +
    'schließen schliessen öffnen oeffnen weiter zurück zurueck fertig abschließen hinweis achtung warnung ' +
    'fehler erfolg neue neuer neues auswahl eingabe ausgabe vorschau vorschaubild vorlage vorlagen entwurf ' +
    'szene szenen bild bilder datei dateien ordner suche suchen gefunden keine kein mehr weniger alle alles ' +
    'jede jeder jedes andere anderen bereits noch schon nur zeigen zeige versteckt verborgen sichtbar ' +
    'unsichtbar bereit läuft wird werden wurde wurden haben hatte habe können koennen muss müssen muessen ' +
    'soll sollen darf dürfen möchte moechte wollen sekunden minuten stunden tage tagen woche wochen monat ' +
    'vor schnitt halb kreative drehbuch drehbücher drehbuecher balken linie glas bis aufgehoben stil ' +
    'referenz störer stoerer verbraucht wörter woerter nacheinander jederzeit kündbar kuendbar verworfen ' +
    'wiederhergestellt erstattet erstattung geändert geaendert übrig uebrig behalten individuelle ' +
    'struktur kreis pille seitliches gleiten verlauf volle flexibilität flexibilitaet kreative freiheit ' +
    'monate jahr jahre mindestens höchstens hoechstens maximal ungefähr etwa jetzt heute gestern morgen ' +
    'später spaeter zuerst zuletzt oben unten rechts vorne hinten klicken tippen drücken druecken ziehen ' +
    'ziehen wählen waehlen wähle geben nehmen machen tun sprache sprachen stimme stimmen töne lautstärke ' +
    'untertitel überschrift ueberschrift zeile zeilen spalte spalten benutzer nutzer konto konten anmelden ' +
    'abmelden registrieren passwort guthaben zahlung zahlungen rechnung rechnungen preis preise kostenlos ' +
    'monatlich jährlich jaehrlich gratis testen probieren wichtig einfach schwierig schnell langsam besser ' +
    'beste schlecht größer groesser klein kleiner kurz breit hoch niedrig hell dunkel leer voll offen ' +
    'geschlossen aktiv inaktiv der die das den dem des ein eine einen einem einer und oder nicht mit von zu ' +
    'zum zur für fuer auf aus bei nach über ueber unter durch ohne zwischen sowie damit dass weil wenn dann ' +
    'sonst jedoch gekauft erreicht angewendet anwenden ansehen erkannt inkonsistent erlaubt versuche nochmal'
  ).split(/\s+/),
);

/** Unambiguous German roots, matched as a substring inside compounds. */
const DE_ROOTS = [
  'erstell', 'lösch', 'loesch', 'speicher', 'bearbeit', 'hochlad', 'herunterlad', 'entfern', 'hinzufüg',
  'hinzufueg', 'abbrech', 'aktivier', 'auswähl', 'auswaehl', 'anzeig', 'einstellung', 'übersicht', 'uebersicht',
  'verfügbar', 'verfuegbar', 'fehlgeschlag', 'erfolgreich', 'generier', 'veröffentlich', 'veroeffentlich',
  'verwend', 'verwalt', 'zurücksetz', 'zuruecksetz', 'sprecher', 'referenzbild', 'farbe', 'farben', 'kosten',
  'vergleich', 'szene', 'untertitel', 'lautstärk', 'guthaben', 'vorschau', 'vorlage', 'entwurf', 'benachrichtig',
  'berechtig', 'geschwindigkeit', 'auswahl', 'eingabe', 'ausgabe', 'überschrift', 'ueberschrift', 'datei',
  'bearbeitung', 'bewertung', 'zahlung', 'rechnung', 'anmeld', 'abmeld', 'hinweis', 'wiederherstell',
  'wiederherge', 'aufgebraucht', 'verworf', 'verbrauch', 'erstatt', 'drehbuch', 'drehbüch', 'kündbar', 'kuendbar',
];

const DE_SUFFIX =
  /\b\p{L}{4,}(ung|ungen|keit|keiten|heit|heiten|schaft|lich|lichen|ische|ischen|barkeit|iert|ierte|ierung)\b/iu;

/**
 * Tokens that look German to the rules above but are English words, product
 * nouns or units. Keeping this list small and explicit is what allows the
 * scorer to trust a single German-exclusive token.
 */
const NEUTRAL = new Set(
  (
    'will war hat sein die alt ton lang gross best doch man links rot bald gut in so an am international start ' +
    'medien team optional standard video videos pause info intro outro logo demo beta pro plus mini max ok id ' +
    'url api ai ui ux cta seo hd fps px kb mb gb ms mode hint tags note body text name label title status error'
  ).split(/\s+/),
);

/**
 * German evidence score. No English veto: mixed strings such as
 * "Template verwenden" must still score.
 */
export function germanEvidence(raw: string): number {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length < 3) return 0;
  const tokens = (text.match(/[\p{L}]{2,}/gu) ?? []).map((w) => w.toLowerCase());
  if (!tokens.length) return 0;
  let score = 0;
  for (const w of tokens) {
    if (NEUTRAL.has(w)) continue;
    if (DE_WORDS.has(w)) score += 3;
    else if (w.length >= 5 && DE_ROOTS.some((r) => w.includes(r))) score += 3;
  }
  if (UML.test(text)) score += 2;
  if (DE_SUFFIX.test(text)) score += 2;
  return score;
}

/** One German-exclusive token is enough — short labels must not escape. */
export function isGerman(text: string): boolean {
  return germanEvidence(text) >= 3;
}

/* ------------------------------------------------------------------ */
/* Range-scoped safe zones                                             */
/* ------------------------------------------------------------------ */

type Range = [number, number];

function skipString(src: string, i: number): number {
  const q = src[i];
  i++;
  while (i < src.length && src[i] !== q) {
    if (src[i] === '\\') i++;
    i++;
  }
  return i;
}

function balanced(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') i = skipString(src, i);
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

/** End of a ternary consequent: the matching `:` at depth 0. */
function endOfConsequent(src: string, from: number): number {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') i = skipString(src, i);
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      if (depth === 0) return i;
      depth--;
    } else if (c === ':' && depth === 0) return i;
  }
  return src.length;
}

export function safeRanges(src: string): Range[] {
  const rs: Range[] = [];
  let m: RegExpExecArray | null;

  // Explicit localisation calls.
  const call = /\b(tx|pickText|useTx\(\)|t)\s*\(/g;
  while ((m = call.exec(src))) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    if (open < 0) continue;
    if (m[1] === 't' && !/^\(\s*(language|lang|uiLang)\b/.test(src.slice(open, open + 24))) continue;
    rs.push([m.index, balanced(src, open)]);
  }

  // `de:` / `es:` dictionary values (value only).
  const key = /(?<![\w$])(de|es|deDE|esES|de_DE|es_ES)\s*:/g;
  while ((m = key.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "'" || c === '"' || c === '`') i = skipString(src, i);
      else if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) {
        if (depth === 0) break;
        depth--;
      } else if (c === ',' && depth === 0) break;
    }
    rs.push([m.index, Math.min(i + 1, src.length)]);
  }

  /*
   * `language === 'de'` — scope the safe zone to the actual German branch.
   * A ternary is safe only up to its `:`; a block guard only to the matching
   * brace. The old blind 400-character window is gone (blind spot d).
   */
  const guard = /(language|lang\w*|uiLang\w*|locale\w*)\s*===\s*['"]de[\w-]*['"]/g;
  while ((m = guard.exec(src))) {
    const after = src.slice(m.index + m[0].length);
    const q = /^\s*\?/.exec(after);
    if (q) {
      rs.push([m.index, endOfConsequent(src, m.index + m[0].length + q[0].length) + 1]);
      continue;
    }
    const brace = src.indexOf('{', m.index + m[0].length);
    if (brace > 0 && brace - (m.index + m[0].length) <= 12) rs.push([m.index, balanced(src, brace)]);
    else rs.push([m.index, m.index + m[0].length]);
  }

  // TypeScript literal-union type positions — semantic values, never rendered.
  const union = /(?::|=|\|)\s*'[^'\n]{2,60}'(?:\s*\|\s*'[^'\n]{2,60}')+/g;
  while ((m = union.exec(src))) rs.push([m.index, m.index + m[0].length]);

  // Non-rendered text: comments, imports, console output.
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
  /\b(\w*[Ll]abel|labels|\w*[Tt]itle|name|displayName|description|desc|hint|tagline|question|subtitle|helper|helperText|tooltip|placeholder|caption|message|heading|summary|cta|ctaLabel|badge|status|error|note|warning|answer|reply|text|body|prefix|suffix|unit|empty|short|long)\s*:\s*(?:'([^'\\\n]{3,300})'|"([^"\\\n]{3,300})"|`([^`$\\\n]{3,300})`)/g;

const ARRAYS =
  /\b(options|quickReplies|tags|items|steps|choices|suggestions|examples|bullets|features|labels|prompts)\s*:\s*\[([^\]]{6,900})\]/g;

const CODEISH = /(=>|===|!==|\breturn\b|;\s|\/\/|\/\*|\*\/|\bconst\b|\bRecord\b|\bfunction\b|\{|\})/;

/** A string literal that itself contains `tx({` renders source text. */
export const MALFORMED_LITERAL = /(['"])((?:\\.|(?!\1)[^\\\n])*?tx\(\s*\{(?:\\.|(?!\1)[^\\\n])*)\1/g;

export function extractSinks(src: string, isJsx = true): Sink[] {
  const out: Sink[] = [];
  let m: RegExpExecArray | null;

  // 1. JSX text nodes, newline tolerant, including nodes adjacent to icons
  //    or fragments (the `}` / `>` boundary both count).
  const jsxText = /[>}]([^<>{}]*?[\p{L}][^<>{}]*?)[<{]/gsu;
  while (isJsx && (m = jsxText.exec(src))) {
    const text = m[1].replace(/\s+/g, ' ').trim();
    if (CODEISH.test(text)) continue;
    // Real JSX text never carries string-literal quotes; those matches are code.
    if (/['"`]/.test(text)) continue;
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

  // 4. toast / notification / document.title argument windows.
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

  // 5. Sibling string arrays (options, quickReplies, features, …).
  while ((m = ARRAYS.exec(src))) {
    const body = m[2];
    const offset = m.index + m[0].indexOf(body);
    const lit = /['"]([^'"\\\n]{3,200})['"]/g;
    let s: RegExpExecArray | null;
    while ((s = lit.exec(body))) {
      out.push({ pos: offset + s.index, text: s[1].trim(), kind: `array:${m[1]}` });
    }
  }

  // 5b. Plain / unkeyed string-literal arrays (`const STEPS = ['Szene wählen', …]`).
  const PLAIN_ARRAY = /=\s*\[((?:\s*(?:'[^'\\\n]{2,200}'|"[^"\\\n]{2,200}")\s*,?){2,})\]/g;
  while ((m = PLAIN_ARRAY.exec(src))) {
    const body = m[1];
    const offset = m.index + m[0].indexOf(body);
    const lit = /['"]([^'"\\\n]{3,200})['"]/g;
    let s2: RegExpExecArray | null;
    while ((s2 = lit.exec(body))) {
      out.push({ pos: offset + s2.index, text: s2[1].trim(), kind: 'array:plain' });
    }
  }

  // 5c. String literals rendered from a ternary branch or an `||` fallback.
  //     Object keys (`key: 'optimieren'`) are deliberately NOT matched.
  const TERNARY_PATTERNS = [
    /\?\s*('[^'\\\n]{3,200}'|"[^"\\\n]{3,200}")/g,
    /\|\|\s*('[^'\\\n]{3,200}'|"[^"\\\n]{3,200}")/g,
    /\?[^:'"`\n]{0,120}:\s*('[^'\\\n]{3,200}'|"[^"\\\n]{3,200}")/g,
  ];
  for (const re of TERNARY_PATTERNS) {
    while ((m = re.exec(src))) {
      out.push({
        pos: m.index + m[0].lastIndexOf(m[1]),
        text: m[1].slice(1, -1).replace(/\s+/g, ' ').trim(),
        kind: 'ternary',
      });
    }
  }

  // 6. Adjacent / split literals joined by `+`.
  const concat = /['"]([^'"\\\n]{2,120})['"]\s*\+\s*['"]([^'"\\\n]{2,120})['"]/g;
  while ((m = concat.exec(src))) {
    out.push({ pos: m.index, text: `${m[1]}${m[2]}`.replace(/\s+/g, ' ').trim(), kind: 'concat' });
  }

  // 7. Static fragments of template literals (interpolations removed).
  const tpl = /`([^`]{4,400})`/g;
  while ((m = tpl.exec(src))) {
    for (const frag of m[1].split(/\$\{[^}]*\}/)) {
      const text = frag.replace(/\s+/g, ' ').trim();
      if (text.length >= 4 && !CODEISH.test(text)) out.push({ pos: m.index, text, kind: 'template' });
    }
  }

  return out;
}

/**
 * Literal `tx(...)` source text that would be rendered verbatim.
 *
 * Anchored on translation *values* (`de:` / `en:` / `es:` followed by a string
 * literal) and lexed forward from the opening quote. Scanning every quote in
 * the file instead produces nonsense matches, because apostrophes in prose and
 * closing quotes of unrelated literals both look like string openers.
 */
export function findMalformedLocalisation(src: string): Array<{ pos: number; text: string }> {
  const out: Array<{ pos: number; text: string }> = [];
  const anchor = /(?<![\w$])(de|en|es)\s*:\s*(?=['"`])/g;
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(src))) {
    const q = m.index + m[0].length;
    const end = skipString(src, q);
    const body = src.slice(q + 1, end);
    // Template interpolations are real code, not rendered text.
    const rendered = src[q] === '`' ? body.replace(/\$\{\s*[\w$.]+\s*\}/g, '') : body;
    if (/\btx\s*\(\s*\{/.test(rendered) || /\bpickText\s*\(/.test(rendered) || /\buseTx\s*\(/.test(rendered)) {
      out.push({ pos: q, text: src.slice(m.index, Math.min(end + 1, m.index + 160)) });
    }
    anchor.lastIndex = Math.max(anchor.lastIndex, end);
  }
  return out;
}



/* ------------------------------------------------------------------ */
/* Repo walk                                                           */
/* ------------------------------------------------------------------ */

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

export function scanRepo(): { offenders: string[]; malformed: string[]; excluded: Record<string, number> } {
  const offenders: string[] = [];
  const malformed: string[] = [];
  const excluded: Record<string, number> = {};

  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    const src = fs.readFileSync(file, 'utf8');

    for (const d of findMalformedLocalisation(src)) {
      malformed.push(`${rel}:${lineOf(src, d.pos)} ${d.text}`);
    }

    const area = AREA_POLICIES.find((p) => p.re.test(rel));
    if (area) {
      excluded[area.reason] = (excluded[area.reason] ?? 0) + 1;
      continue;
    }

    const allowed = new Set((ALLOWLIST[rel] ?? []).map((a) => a.text));
    const isJsx = file.endsWith('.tsx');
    const rs = safeRanges(src);
    const seen = new Set<string>();
    for (const sink of extractSinks(src, isJsx)) {
      if (inSafe(sink.pos, rs)) continue;
      if (allowed.has(sink.text)) continue;
      if (!isGerman(sink.text)) continue;
      const key = `${lineOf(src, sink.pos)}:${sink.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offenders.push(`${rel}:${lineOf(src, sink.pos)} [${sink.kind}] ${sink.text.slice(0, 120)}`);
    }
  }
  return { offenders, malformed, excluded };
}

/* ------------------------------------------------------------------ */
/* Self-tests — one fixture per sink / error class                     */
/* ------------------------------------------------------------------ */

const flags = (src: string) => {
  const rs = safeRanges(src);
  return extractSinks(src).filter((s) => !inSafe(s.pos, rs) && isGerman(s.text));
};

describe('deep detector self-tests — sink classes', () => {
  const cases: Array<[string, string, string]> = [
    ['plain JSX text', `<p>Credits kaufen</p>`, 'jsx-text'],
    ['multi-line JSX text', `<p>\n  Erstelle automatisch wiederkehrende Events\n</p>`, 'jsx-text'],
    ['JSX child adjacent to an icon', `<Button><Icon /> Verwenden</Button>`, 'jsx-text'],
    ['title attribute', `<button title="Am Playhead teilen" />`, 'attr:title'],
    ['placeholder without umlaut', `<Input placeholder="Kurzbeschreibung des Produkts eingeben" />`, 'attr:placeholder'],
    ['aria-label', `<button aria-label="Sidebar ausblenden" />`, 'attr:aria-label'],
    ['toast title/description', `toast.success('Thumbnail wurde erfolgreich generiert');`, 'toast'],
    ['document.title', `document.title = 'Ergebnisse — Studio';`, 'toast'],
    ['sibling quickReplies array', `const c = { quickReplies: ['Wizard nutzen', 'Nein danke'] };`, 'array:quickReplies'],
    ['sibling options array', `const q = { options: ['Werbung fuer die Marke', 'Bildung'] };`, 'array:options'],
    ['template literal static fragment', 'const s = `${n} Sounds generiert`;', 'template'],
    ['concatenated split sentence', `const m = 'Mindestens ' + '3 Sekunden erforderlich';`, 'concat'],
    ['config label + description fields', `export const P = { id: 'x', label: 'Highlight-Farbe', description: 'Referenzbild waehlen' };`, 'field:label'],
    ['hook-returned status string', `function useS() { return { status: 'Lade Videos …' }; }`, 'field:status'],
  ];

  for (const [name, src, kind] of cases) {
    it(`detects ${name}`, () => {
      const hits = flags(src);
      expect(hits.map((h) => h.kind).join(','), `${name}: ${JSON.stringify(hits)}`).toContain(kind);
    });
  }

  it('detects a short one-word German label', () => {
    for (const w of ['Verwenden', 'Starten', 'Ergebnisse', 'Sprecher', 'Spalten']) {
      expect(isGerman(w), w).toBe(true);
    }
  });

  it('detects short mixed / bilingual labels (no English veto)', () => {
    for (const s of ['Template verwenden', 'Brand-Kit verwenden', 'Credits kaufen', 'Kosten-Vergleich', 'VO FEHLT', 'Highlight-Farbe']) {
      expect(isGerman(s), s).toBe(true);
    }
  });

  it('detects malformed nested tx() source text', () => {
    const bad = [
      `description: tx({ de: 'Zeigt alle verfügbaren {tx({ de: "Befehle", en: "Commands" })}', en: 'Shows commands' })`,
      `<p>{tx({ de: "{tx({ de: 'Noch keine Quellen.', en: 'No sources yet.' })}", en: "No sources yet." })}</p>`,
    ];
    for (const src of bad) expect(findMalformedLocalisation(src).length, src).toBeGreaterThan(0);
  });
});

describe('deep detector self-tests — negative controls', () => {
  it('ignores German inside tx({ de, en, es })', () => {
    expect(flags(`<p>{tx({ de: 'Credits kaufen', en: 'Buy credits', es: 'Comprar créditos' })}</p>`)).toEqual([]);
  });

  it('flags every historical real leak in the regression corpus', () => {
    // 157 literals that genuinely leaked into the English UI and were fixed.
    // The previous guard missed most of them; this corpus pins that gap shut.
    const corpus: string[] = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures', 'german-leak-corpus.json'), 'utf8'),
    );
    const missed = corpus.filter((t) => !isGerman(t));
    expect(missed, `detector regressed on:\n${missed.join('\n')}`).toEqual([]);
    expect(corpus.length).toBeGreaterThan(150);
  });



  it('ignores de:/es: dictionary values', () => {
    expect(flags(`const M = { de: 'Einstellungen speichern', en: 'Save settings', es: 'Guardar' };`)).toEqual([]);
  });

  it('ignores tri-language tuples', () => {
    expect(flags(`const T = { de: 'Sprecher', en: 'Speaker', es: 'Orador' } as const;`)).toEqual([]);
  });

  it('scopes a language === "de" ternary to its consequent only', () => {
    const src = `const a = language === 'de' ? 'Alles zurücksetzen' : 'Reset everything';`;
    expect(flags(src)).toEqual([]);
  });

  it('does NOT extend the de-branch safe zone over adjacent English UI', () => {
    const src =
      `const a = language === 'de' ? 'Alles zurücksetzen' : 'Reset everything';\n` +
      `<p>Credits kaufen</p>`;
    expect(flags(src).some((h) => h.text === 'Credits kaufen')).toBe(true);
  });

  it('ignores semantic ids that have a localized display map', () => {
    const src = `const CAT = ['Störer'] as const;\nconst LABEL = { 'Störer': { de: 'Störer', en: 'Flash badge', es: 'Distintivo' } };`;
    expect(flags(src).length).toBe(0);
  });

  it('ignores comments, logs and AI-prompt payloads in safe ranges', () => {
    const src = `// Erstelle automatisch wiederkehrende Events\nconsole.warn('Analyse fehlgeschlagen');`;
    expect(flags(src)).toEqual([]);
  });

  it('does not flag ordinary English UI copy', () => {
    const src = `<p>Create automatically recurring events for your team</p>\n<Input placeholder="Enter a short product description" />`;
    expect(flags(src)).toEqual([]);
  });

  it('does not flag well-formed interpolated tx() calls', () => {
    expect(findMalformedLocalisation('const s = `${tx({ de: "Fehler", en: "Error" })}: ${msg}`;')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Repo-wide contract                                                  */
/* ------------------------------------------------------------------ */

describe('English UI purity (deep)', () => {
  const result = scanRepo();

  it('has no EN-reachable German UI copy', () => {
    expect(
      result.offenders,
      `${result.offenders.length} EN-reachable German UI residual(s) — wrap in tx({ de, en, es }):\n${result.offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('renders no malformed nested tx() source text', () => {
    expect(
      result.malformed,
      `${result.malformed.length} malformed localisation site(s):\n${result.malformed.join('\n')}`,
    ).toEqual([]);
  });

  it('keeps every allowlist entry justified and narrow', () => {
    for (const [file, entries] of Object.entries(ALLOWLIST)) {
      expect(fs.existsSync(path.join(SRC, file)), `stale allowlist entry: ${file}`).toBe(true);
      for (const e of entries) {
        expect(e.reason.length, `${file} → "${e.text}" needs a justification`).toBeGreaterThan(20);
      }
    }
    // Sink-scoped only: no path-level trust.
    expect(Object.values(ALLOWLIST).flat().length).toBeLessThanOrEqual(8);
  });
});
