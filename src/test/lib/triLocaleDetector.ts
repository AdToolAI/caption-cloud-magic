/**
 * Tri-locale UI purity detector.
 *
 * Shared, symmetric successor of the English-only detector in
 * `english-ui-purity-deep.test.ts`. It answers three questions for every
 * source file:
 *
 *   1. EN mode — does an ordinary creator-facing sink render German/Spanish
 *      copy outside an explicit language branch?
 *   2. DE mode — does an explicit German branch value contain English or
 *      Spanish copy?
 *   3. ES mode — does an explicit Spanish branch value contain English or
 *      German copy?
 *
 * Hardening lessons baked in (each one produced a false verdict before):
 *   (a) `language === 'de' ? de : enUS` (date-fns locales) must NOT open a
 *       German range — only true object properties `{ de: '…' }` do.
 *   (b) A `tx({ de, en, es })` call nested inside a `language === 'de'` guard
 *       still carries legitimate EN/ES values: the inner property range wins.
 *   (c) German UI copy legitimately borrows "Upload", "Account", "Login",
 *       "Publish-Rate" — only multi-word English sentences count as a leak.
 *   (d) German plurals ending in `-mente` ("Elemente", "Segmente") are not
 *       Spanish adverbs; "gratis" / "total" / "legal" / "normal" are shared.
 *   (e) Short German function words ("das", "die", "der") also exist in
 *       Spanish sentences and must not outvote Spanish orthography.
 */

/* ------------------------------------------------------------------ */
/* Lexicons                                                            */
/* ------------------------------------------------------------------ */

const UML = /[äöüÄÖÜß]/;
const ES_ORTHO = /[ñ¿¡]|[áéíóú]/;

export const DE_WORDS = new Set(
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
    'struktur kreis pille seitliches gleiten verlauf volle flexibilität flexibilitaet freiheit ' +
    'monate jahr jahre mindestens höchstens hoechstens maximal ungefähr etwa jetzt heute gestern morgen ' +
    'später spaeter zuerst zuletzt oben unten rechts vorne hinten klicken tippen drücken druecken ziehen ' +
    'wählen waehlen wähle geben nehmen machen tun sprache sprachen stimme stimmen töne lautstärke ' +
    'untertitel überschrift ueberschrift zeile zeilen spalte spalten benutzer nutzer konto konten anmelden ' +
    'abmelden registrieren passwort guthaben zahlung zahlungen rechnung rechnungen preis preise kostenlos ' +
    'monatlich jährlich jaehrlich testen probieren wichtig einfach schwierig schnell langsam besser ' +
    'beste schlecht größer groesser klein kleiner kurz breit hoch niedrig hell dunkel voll offen ' +
    'geschlossen aktiv inaktiv der die das den dem des ein eine einen einem einer und oder nicht mit von zu ' +
    'zum zur für fuer auf aus bei nach über ueber unter durch ohne zwischen sowie damit dass weil wenn dann ' +
    'sonst jedoch gekauft erreicht angewendet anwenden ansehen erkannt inkonsistent erlaubt versuche nochmal ' +
    'eingeben eingegeben titel meine mein meinen unsere unser bibliothek medienbibliothek leer ausfüllen ausfuellen eintragen benennen umbenennen verschieben kopieren einfügen einfuegen ' +
    'im abo aktuell aktuelles aktuelle aktives aktiver marken erneut erzeugt zuschnittbereich beibehalten ' +
    'keinen keiner bitte nochmals derzeit bereich bereiche seite seiten liste listen wert werte'
  ).split(/\s+/),
);

export const DE_ROOTS = [
  'erstell', 'lösch', 'loesch', 'speicher', 'bearbeit', 'hochlad', 'herunterlad', 'entfern', 'hinzufüg',
  'hinzufueg', 'abbrech', 'aktivier', 'auswähl', 'auswaehl', 'anzeig', 'einstellung', 'übersicht', 'uebersicht',
  'verfügbar', 'verfuegbar', 'fehlgeschlag', 'erfolgreich', 'generier', 'veröffentlich', 'veroeffentlich',
  'verwend', 'verwalt', 'zurücksetz', 'zuruecksetz', 'sprecher', 'referenzbild', 'farbe', 'farben', 'kosten',
  'vergleich', 'szene', 'untertitel', 'lautstärk', 'guthaben', 'vorschau', 'vorlage', 'entwurf', 'benachrichtig',
  'berechtig', 'geschwindigkeit', 'auswahl', 'eingabe', 'ausgabe', 'überschrift', 'ueberschrift', 'datei',
  'bearbeitung', 'bewertung', 'bibliothek', 'eingeb', 'zahlung', 'rechnung', 'anmeld', 'abmeld', 'hinweis', 'wiederherstell',
  'wiederherge', 'aufgebraucht', 'verworf', 'verbrauch', 'erstatt', 'drehbuch', 'drehbüch', 'kündbar', 'kuendbar',
  'zuschnitt', 'markenset', 'marken-set', 'lippensynchron', 'beibehalt', 'erzeug', 'bewegung', 'stimmung',
  'reihenfolge', 'schnellste', 'sprachaus', 'tonspur', 'werbung', 'nachricht', 'zeitplan',
];

const DE_SUFFIX =
  /\b\p{L}{4,}(ung|ungen|keit|keiten|heit|heiten|schaft|lich|lichen|ische|ischen|barkeit|iert|ierte|ierung)\b/iu;

/** Product nouns, units and loanwords that look German to the rules above. */
export const NEUTRAL = new Set(
  (
    'will war hat sein die alt ton lang gross best doch man links rot bald gut in so an am international start ' +
    'medien team optional standard video videos pause info intro outro logo demo beta pro plus mini max ok id ' +
    'url api ai ui ux cta seo hd fps px kb mb gb ms mode hint tags note body text name label title status ' +
    'no se de la el en un una es son por para con sin del al lo los las'
  ).split(/\s+/),
);

/** Short German function words that are ordinary Spanish words too. */
// `leer` is German "empty" but Spanish "to read"; `total`-style overlaps live
// in SHARED_DE_ES. Keep this list to genuinely ambiguous tokens only.
const DE_AMBIGUOUS_IN_ES = new Set('das die der den dem des ein eine einen einer con no se leer'.split(' '));

const ENDONYM =
  /^(Español|Deutsch|English|Français|Italiano|Português|Nederlands|Svenska|Polski|Türkçe|Čeština|Русский|日本語|한국어|中文)$/;

const strip = (raw: string) => String(raw).replace(/^[^\p{L}]+/u, '').trim();

export function germanEvidence(raw: string): number {
  if (ENDONYM.test(strip(raw))) return 0;
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (text.length < 3) return 0;
  const tokens = (text.match(/[\p{L}]{2,}/gu) ?? []).map((w) => w.toLowerCase());
  if (!tokens.length) return 0;
  // Spanish context: orthography, or at least two unmistakable Spanish words.
  // Without the word-based branch, "No se pudo leer el briefing" (no accents)
  // scored as German through the shared token "leer".
  const esLeaning =
    !UML.test(text) &&
    (ES_ORTHO.test(text) || tokens.filter((w) => ES_WORDS.has(w)).length >= 2);
  let score = 0;
  for (const w of tokens) {
    if (NEUTRAL.has(w)) continue;
    if (DE_AMBIGUOUS_IN_ES.has(w)) {
      // Ambiguous tokens ("leer" = German "empty" / Spanish "to read", plus the
      // article set) only carry full weight when they ARE the whole label.
      if (!esLeaning && tokens.length === 1) score += 3;
      continue;
    }
    if (DE_WORDS.has(w)) score += 3;
    else if (w.length >= 5 && DE_ROOTS.some((r) => w.includes(r))) score += 3;
  }
  if (UML.test(text)) score += 2;
  if (DE_SUFFIX.test(text)) score += 2;
  return score;
}

export const isGerman = (t: string) => germanEvidence(t) >= 3;

const ES_WORDS = new Set(
  (
    'crear crea creado creando guardar guarda guardado eliminar elimina borrar editar edita subir subiendo ' +
    'descargar cargar cargando cancelar cancelado activar activado desactivar seleccionar selecciona ' +
    'seleccionado mostrar mostrando ajustes configuración descripción duración resolución vista previa ' +
    'idioma idiomas voz voces créditos escena escenas archivo archivos carpeta buscar buscando encontrado ' +
    'ninguno ninguna todos todas más menos otro otra ya todavía solo oculto listo ' +
    'éxito exitoso fallido nuevo nueva plantilla plantillas borrador imagen imágenes ' +
    'segundos minutos horas días semana semanas mes meses año años ahora hoy ayer mañana después primero ' +
    'último arriba abajo derecha izquierda hacer clic elegir elige tomar dar velocidad volumen subtítulos ' +
    'título línea líneas columna usuario usuarios cuenta iniciar sesión cerrar contraseña saldo pago pagos ' +
    'factura precio precios mensual anual probar importante fácil difícil rápido lento mejor peor ' +
    'grande pequeño corto ancho alto bajo claro oscuro vacío lleno abierto cerrado activo inactivo ' +
    'necesita puede debe está están tiene tienen desde hasta entre porque cuando entonces pero también ' +
    'añadir agregar quitar restablecer reintentar volver atrás siguiente aviso advertencia'
  ).split(/\s+/),
);

const ES_ROOTS = ['ción', 'ciones', 'idad', 'mente', 'ando', 'iendo', 'ísim'];

/** German plurals that collide with the Spanish adverbial `-mente` suffix. */
const ES_FALSE_FRIENDS = new Set(
  'elemente segmente dokumente momente argumente instrumente experimente fragmente'.split(' '),
);

/** Identical in German and Spanish — weak evidence only. */
const SHARED_DE_ES = new Set(['gratis', 'total', 'normal', 'legal']);

export function spanishEvidence(raw: string): number {
  if (ENDONYM.test(strip(raw))) return 0;
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (text.length < 3) return 0;
  if (/^[a-z]{2}-[A-Z]{2}$/.test(text)) return 0;
  const tokens = (text.match(/[\p{L}]{2,}/gu) ?? []).map((w) => w.toLowerCase());
  if (!tokens.length) return 0;
  let score = 0;
  for (const w of tokens) {
    if (ES_FALSE_FRIENDS.has(w)) continue;
    if (SHARED_DE_ES.has(w)) { score += 1; continue; }
    if (ES_WORDS.has(w)) score += 3;
    else if (w.length >= 6 && ES_ROOTS.some((r) => w.endsWith(r))) score += 3;
  }
  if (/[ñ¿¡]/.test(text)) score += 3;
  else if (ES_ORTHO.test(text) && !UML.test(text)) score += 1;
  return score;
}

export const isSpanish = (t: string) => spanishEvidence(t) >= 3 && germanEvidence(t) < 3;

const EN_WORDS = new Set(
  (
    'the your you a an and or not with without from into for this that these those please could would should ' +
    'will has have been being are is was were create created creating save saved delete edit upload uploaded ' +
    'download remove cancel enable disable select selected show hide settings overview available failed ' +
    'successful generate generated export import optimize update notification recommendation publish manage ' +
    'reset retry sort rate describe description security permission speed readability close open next back ' +
    'done finish note warning success new choice input output preview template draft scene image file ' +
    'folder search found none more less all every other already still only hidden ready running ' +
    'seconds minutes hours days week month year now today yesterday tomorrow later first last top bottom ' +
    'right left click tap press drag choose give take make language voice volume subtitles headline line ' +
    'column user account sign login logout password credits payment invoice price free monthly yearly try ' +
    'important easy difficult fast slow better best bad bigger small short wide high low light dark empty ' +
    'full active inactive generates text only what how why when where which'
  ).split(/\s+/),
);

export function englishEvidence(raw: string): number {
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (text.length < 3) return 0;
  const tokens = (text.match(/[\p{L}']{2,}/gu) ?? []).map((w) => w.toLowerCase());
  let score = 0;
  for (const w of tokens) if (EN_WORDS.has(w)) score += 3;
  return score;
}

export const isEnglish = (t: string) =>
  englishEvidence(t) >= 6 && germanEvidence(t) < 3 && spanishEvidence(t) < 3;

/**
 * Stricter variant for judging a German/Spanish branch value: DE/ES product
 * copy legitimately borrows single English nouns. Only sentences count.
 */
export const isEnglishSentence = (t: string) =>
  englishEvidence(t) >= 9 &&
  (String(t).match(/[\p{L}']{2,}/gu) ?? []).length >= 4 &&
  germanEvidence(t) < 3 &&
  spanishEvidence(t) < 3;

/* ------------------------------------------------------------------ */
/* Source ranges                                                       */
/* ------------------------------------------------------------------ */

export type Range = [number, number];

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

function valueRange(src: string, from: number): number {
  let i = from;
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
  return Math.min(i + 1, src.length);
}

export interface LocaleRange {
  lang: 'de' | 'en' | 'es';
  a: number;
  b: number;
  /** True for an explicit `{ de: … }` object property (beats guard ranges). */
  prop: boolean;
}

/** Ranges that belong to one specific locale. */
export function localeRanges(src: string): LocaleRange[] {
  const out: LocaleRange[] = [];
  let m: RegExpExecArray | null;

  // Object-property form only — `language === 'de' ? de : enUS` must not match.
  const key = /(^|[{,(\n])\s*(de|en|es)\s*:\s*(?=['"`[{])/gm;
  while ((m = key.exec(src))) {
    const start = m.index + m[0].length;
    out.push({ lang: m[2] as LocaleRange['lang'], a: start, b: valueRange(src, start), prop: true });
  }

  const guard = /(language|lang\w*|uiLang\w*|locale\w*)\s*===\s*['"](de|es|en)[\w-]*['"]/g;
  while ((m = guard.exec(src))) {
    const lang = m[2] as LocaleRange['lang'];
    const after = src.slice(m.index + m[0].length);
    const q = /^\s*\?/.exec(after);
    if (q) {
      out.push({ lang, a: m.index, b: endOfConsequent(src, m.index + m[0].length + q[0].length) + 1, prop: false });
      continue;
    }
    const brace = src.indexOf('{', m.index + m[0].length);
    if (brace > 0 && brace - (m.index + m[0].length) <= 12) {
      out.push({ lang, a: m.index, b: balanced(src, brace), prop: false });
    }
  }
  return out;
}

/** Regions where non-English copy is legitimate while EN is selected. */
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
  while ((m = key.exec(src))) rs.push([m.index, valueRange(src, m.index + m[0].length)]);

  const guard = /(language|lang\w*|uiLang\w*|locale\w*)\s*(===|!==)\s*['"](de|es)[\w-]*['"]/g;
  while ((m = guard.exec(src))) {
    const after = src.slice(m.index + m[0].length);
    const q = /^\s*\?/.exec(after);
    if (q) {
      const c = endOfConsequent(src, m.index + m[0].length + q[0].length);
      rs.push([m.index, c + 1]);
      rs.push([c, valueRange(src, c + 1)]);
      continue;
    }
    const brace = src.indexOf('{', m.index + m[0].length);
    if (brace > 0 && brace - (m.index + m[0].length) <= 12) rs.push([m.index, balanced(src, brace)]);
    else rs.push([m.index, m.index + m[0].length]);
  }

  const union = /(?::|=|\|)\s*'[^'\n]{2,60}'(?:\s*\|\s*'[^'\n]{2,60}')+/g;
  while ((m = union.exec(src))) rs.push([m.index, m.index + m[0].length]);

  for (const re of [/\/\/[^\n]*/g, /\/\*[\s\S]*?\*\//g, /^import[^\n]*$/gm]) {
    while ((m = re.exec(src))) rs.push([m.index, m.index + m[0].length]);
  }
  const log = /console\.\w+\s*\(/g;
  while ((m = log.exec(src))) rs.push([m.index, balanced(src, src.indexOf('(', m.index))]);

  return rs;
}

/* ------------------------------------------------------------------ */
/* Sinks                                                               */
/* ------------------------------------------------------------------ */

const ATTRS =
  /\b(placeholder|title|aria-label|aria-description|alt|data-tooltip|label|helperText|description|caption|tooltip|emptyMessage|emptyState)\s*=\s*(?:"([^"\n]{2,300})"|'([^'\n]{2,300})'|\{\s*['"`]([^'"`\n]{2,300})['"`]\s*\})/g;
const FIELDS =
  /\b(\w*[Ll]abel|labels|\w*[Tt]itle|name|displayName|description|desc|hint|tagline|question|subtitle|helper|helperText|tooltip|placeholder|caption|message|heading|summary|cta|ctaLabel|badge|status|error|note|warning|answer|reply|text|body|prefix|suffix|unit|empty|short|long)\s*:\s*(?:'([^'\\\n]{3,300})'|"([^"\\\n]{3,300})"|`([^`$\\\n]{3,300})`)/g;
const ARRAYS =
  /\b(options|quickReplies|tags|items|steps|choices|suggestions|examples|bullets|features|labels|prompts)\s*:\s*\[([^\]]{6,900})\]/g;
const CODEISH = /(=>|===|!==|\breturn\b|;\s|\/\/|\/\*|\*\/|\bconst\b|\bRecord\b|\bfunction\b|\{|\})/;

export interface Sink {
  pos: number;
  text: string;
  kind: string;
}

export function extractSinks(src: string, isJsx = true): Sink[] {
  const out: Sink[] = [];
  let m: RegExpExecArray | null;

  // Module-level /g regexes keep `lastIndex` between calls. Without this reset
  // the second and every following file silently loses whole sink classes —
  // exactly the recall regression this guard exists to prevent.
  for (const re of [ATTRS, FIELDS, ARRAYS]) re.lastIndex = 0;


  const jsxText = /[>}]([^<>{}]*?[\p{L}][^<>{}]*?)[<{]/gsu;
  while (isJsx && (m = jsxText.exec(src))) {
    const text = m[1].replace(/\s+/g, ' ').trim();
    if (CODEISH.test(text) || /['"`]/.test(text)) continue;
    if (text.length >= 3) out.push({ pos: m.index + 1, text, kind: 'jsx-text' });
  }
  while ((m = ATTRS.exec(src))) {
    const text = (m[2] ?? m[3] ?? m[4] ?? '').replace(/\s+/g, ' ').trim();
    if (text.length >= 3) out.push({ pos: m.index, text, kind: `attr:${m[1]}` });
  }
  while ((m = FIELDS.exec(src))) {
    const text = (m[2] ?? m[3] ?? m[4] ?? '').replace(/\s+/g, ' ').trim();
    if (text.length >= 3) out.push({ pos: m.index, text, kind: `field:${m[1]}` });
  }
  const shout = /(toast[.\w]*\s*\(|document\.title\s*=|new Notification\s*\()/g;
  while ((m = shout.exec(src))) {
    const start = m.index;
    const seg = src.slice(start, start + 600);
    const lit = /['"]([^'"\\\n]{4,250})['"]/g;
    let s: RegExpExecArray | null;
    while ((s = lit.exec(seg))) out.push({ pos: start + s.index, text: s[1].replace(/\s+/g, ' ').trim(), kind: 'toast' });
  }
  while ((m = ARRAYS.exec(src))) {
    const body = m[2];
    const offset = m.index + m[0].indexOf(body);
    const lit = /['"]([^'"\\\n]{3,200})['"]/g;
    let s: RegExpExecArray | null;
    while ((s = lit.exec(body))) out.push({ pos: offset + s.index, text: s[1].trim(), kind: `array:${m[1]}` });
  }
  const PLAIN_ARRAY = /=\s*\[((?:\s*(?:'[^'\\\n]{2,200}'|"[^"\\\n]{2,200}")\s*,?){2,})\]/g;
  while ((m = PLAIN_ARRAY.exec(src))) {
    const body = m[1];
    const offset = m.index + m[0].indexOf(body);
    const lit = /['"]([^'"\\\n]{3,200})['"]/g;
    let s: RegExpExecArray | null;
    while ((s = lit.exec(body))) out.push({ pos: offset + s.index, text: s[1].trim(), kind: 'array:plain' });
  }
  for (const re of [
    /\?\s*('[^'\\\n]{3,200}'|"[^"\\\n]{3,200}")/g,
    /\|\|\s*('[^'\\\n]{3,200}'|"[^"\\\n]{3,200}")/g,
    /\?[^:'"`\n]{0,120}:\s*('[^'\\\n]{3,200}'|"[^"\\\n]{3,200}")/g,
  ]) {
    while ((m = re.exec(src))) {
      out.push({
        pos: m.index + m[0].lastIndexOf(m[1]),
        text: m[1].slice(1, -1).replace(/\s+/g, ' ').trim(),
        kind: 'ternary',
      });
    }
  }
  const concat = /['"]([^'"\\\n]{2,120})['"]\s*\+\s*['"]([^'"\\\n]{2,120})['"]/g;
  while ((m = concat.exec(src))) out.push({ pos: m.index, text: `${m[1]}${m[2]}`.replace(/\s+/g, ' ').trim(), kind: 'concat' });

  const tpl = /`([^`]{4,400})`/g;
  while ((m = tpl.exec(src))) {
    for (const frag of m[1].split(/\$\{[^}]*\}/)) {
      const text = frag.replace(/\s+/g, ' ').trim();
      if (text.length >= 4 && !CODEISH.test(text)) out.push({ pos: m.index, text, kind: 'template' });
    }
  }
  return out;
}

export const NOISE = (t: string) =>
  /^[a-z][\w-]*(\.[\w-]+)+$/.test(t) ||
  /[()<>=]/.test(t) ||
  /\b(catch|try|const|let|await|async|function|typeof|null|undefined|props|error)\b/.test(t) ||
  /^[\w-]+:\s*$/.test(t) ||
  /^https?:/.test(t);

export const inSafe = (pos: number, rs: Range[]) => rs.some(([a, b]) => pos >= a && pos < b);
export const lineOf = (src: string, pos: number) => src.slice(0, pos).split('\n').length;

/* ------------------------------------------------------------------ */
/* File-level analysis                                                 */
/* ------------------------------------------------------------------ */

export interface Finding {
  mode: 'en' | 'de' | 'es';
  line: number;
  as: 'de' | 'en' | 'es';
  text: string;
  kind: string;
}

/**
 * Keys of a tri-locale label map (`Foo: { de, en, es }`) are semantic IDs:
 * the display copy lives in the map, the key never reaches the screen.
 */
export function semanticIds(src: string): Set<string> {
  const ids = new Set<string>();
  const re = /(?:^|[{,\n])\s*'?"?([\p{L}\d][\p{L}\d _-]{1,60}?)'?"?\s*:\s*\{[^{}]*\bde\s*:/gmu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) ids.add(m[1].trim());
  return ids;
}

export function analyzeFile(src: string, isJsx: boolean, allowed = new Set<string>()): Finding[] {
  const findings: Finding[] = [];
  const ids = semanticIds(src);
  const isSemanticId = (t: string) => {
    const bare = t.replace(/^[\s,]+|[\s,:]+$/g, '');
    return ids.has(bare);
  };

  // 1) EN mode — bare DE/ES in an ordinary sink.
  const rs = safeRanges(src);
  const seen = new Set<string>();
  for (const sink of extractSinks(src, isJsx)) {
    if (inSafe(sink.pos, rs)) continue;
    if (allowed.has(sink.text) || isSemanticId(sink.text)) continue;
    const de = isGerman(sink.text);
    const es = isSpanish(sink.text);
    if (!de && !es) continue;
    if (NOISE(sink.text)) continue;
    const line = lineOf(src, sink.pos);
    const key = `${line}:${sink.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ mode: 'en', line, as: de ? 'de' : 'es', text: sink.text.slice(0, 140), kind: sink.kind });
  }

  // 2/3) DE and ES branch values carrying foreign copy.
  const lrs = localeRanges(src);
  const propRanges = lrs.filter((r) => r.prop);
  for (const r of lrs) {
    if (r.lang === 'en') continue;
    const body = src.slice(r.a, r.b);
    const lit = /['"`]([^'"`\\\n]{6,300})['"`]/g;
    let m: RegExpExecArray | null;
    while ((m = lit.exec(body))) {
      const abs = r.a + m.index;
      // An explicit locale property nested inside a guard owns its own value.
      if (propRanges.some((q) => q.lang !== r.lang && abs >= q.a && abs < q.b && q.a >= r.a && q.b <= r.b)) continue;
      const t = m[1].replace(/\$\{[^}]*\}/g, ' ').trim();
      if (t.length < 6 || allowed.has(t)) continue;
      const line = lineOf(src, abs);
      if (r.lang === 'de' && (isEnglishSentence(t) || isSpanish(t))) {
        findings.push({ mode: 'de', line, as: isSpanish(t) ? 'es' : 'en', text: t.slice(0, 140), kind: 'branch:de' });
      }
      if (r.lang === 'es' && (isEnglishSentence(t) || isGerman(t))) {
        findings.push({ mode: 'es', line, as: isGerman(t) ? 'de' : 'en', text: t.slice(0, 140), kind: 'branch:es' });
      }
    }
  }
  return findings;
}

/**
 * Half-localized collection: a `tx({…})` / `{ de, en, es }` map that is missing
 * one of the three locales, so that locale silently renders another language.
 */
export function findHalfLocalized(src: string): Array<{ pos: number; text: string; missing: string[] }> {
  const out: Array<{ pos: number; text: string; missing: string[] }> = [];
  const call = /\b(tx|pickText)\s*\(\s*(?:[\w.]+\s*,\s*)?\{/g;
  let m: RegExpExecArray | null;
  while ((m = call.exec(src))) {
    const open = src.indexOf('{', m.index);
    const end = balanced(src, open);
    const body = src.slice(open, end);
    const missing = (['de', 'en', 'es'] as const).filter((l) => !new RegExp(`(^|[{,\\s])${l}\\s*:`).test(body));
    if (missing.length) out.push({ pos: m.index, text: src.slice(m.index, Math.min(end, m.index + 120)), missing });
    call.lastIndex = Math.max(call.lastIndex, end);
  }
  return out;
}

/**
 * Module-scope localization calls freeze the language at import time, so an
 * in-app language switch cannot update them. New ones are forbidden.
 */
export function findModuleScopeLocalization(src: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  src.split('\n').forEach((line, idx) => {
    if (!/^(export\s+)?(const|let|var)\s[^=]*=/.test(line)) return;
    if (!/\b(tx|pickText)\s*\(/.test(line)) return;
    // `const f = () => tx(...)` is lazy and therefore fine.
    if (/=>\s*(\{|tx\s*\(|pickText\s*\()/.test(line) || /=\s*(async\s+)?function\b/.test(line)) return;
    out.push({ line: idx + 1, text: line.trim().slice(0, 120) });
  });
  return out;
}
