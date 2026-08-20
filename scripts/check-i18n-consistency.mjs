#!/usr/bin/env node
/**
 * Guard against machine-translation damage inside tx({ de, en, es }) blocks.
 *
 * Checks:
 *  1. Placeholder parity: the ${...} expressions of en/es must use the same
 *     identifiers as the de variant (translated code = build break).
 *  2. Translated technical values: Intl date/time option values, locale codes
 *     and common comparison literals must stay in English.
 *
 * Usage: node scripts/check-i18n-consistency.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src", "supabase/functions"];
const EXT = /\.(ts|tsx)$/;

const TX = /tx\(\{ de: `((?:\\.|[^`])*)`, en: `((?:\\.|[^`])*)`, es: `((?:\\.|[^`])*)` \}\)/g;
const PLACEHOLDER = /\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
const STRING_LITERAL = /'(?:\\.|[^'])*'|"(?:\\.|[^"])*"/g;

const BAD_TECHNICAL = [
  /weekday:\s*'(?!long|short|narrow)[^']+'/,
  /(hour|minute|second|day|month|year):\s*'(?!2-digit|numeric|long|short|narrow)[^']+'/,
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (EXT.test(entry)) out.push(full);
  }
  return out;
}

const identifiers = (code) =>
  new Set((code.replace(STRING_LITERAL, "''").match(/[A-Za-z_$][\w$]*/g) || []));

const problems = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8");
    const lineOf = (index) => source.slice(0, index).split("\n").length;

    for (const match of source.matchAll(TX)) {
      const [full, de, en, es] = match;
      const dePlaceholders = de.match(PLACEHOLDER) || [];
      for (const [lang, text] of [["en", en], ["es", es]]) {
        const placeholders = text.match(PLACEHOLDER) || [];
        if (placeholders.length !== dePlaceholders.length) continue;
        placeholders.forEach((placeholder, i) => {
          const expected = identifiers(dePlaceholders[i]);
          for (const token of identifiers(placeholder)) {
            if (!expected.has(token)) {
              problems.push(
                `${file}:${lineOf(match.index)} [${lang}] translated code in placeholder: ${placeholder}`,
              );
              break;
            }
          }
        });
      }
      if (/toLocale(Date|Time)?String|DateTimeFormat/.test(full)) {
        for (const rule of BAD_TECHNICAL) {
          if (rule.test(full)) {
            problems.push(`${file}:${lineOf(match.index)} translated Intl option in tx block`);
          }
        }
      }
    }

    source.split("\n").forEach((line, i) => {
      // Collapsed translation entries: an automated pass once merged several
      // keys into one string value ("Title', otherKey: 'Value"), which leaks
      // raw keys into the UI. Flag any value containing `', someKey: '`.
      const collapsed = line.match(/^\s*[A-Za-z0-9_]+:\s*"[^"]*',\s*[A-Za-z0-9_]+:\s*'/);
      if (collapsed) {
        problems.push(`${file}:${i + 1} collapsed translation entry: ${line.trim().slice(0, 120)}`);
      }
      if (!/toLocale(Date|Time)?String|DateTimeFormat/.test(line)) return;
      for (const rule of BAD_TECHNICAL) {
        if (rule.test(line)) {
          problems.push(`${file}:${i + 1} translated Intl option: ${line.trim().slice(0, 120)}`);
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 3. Language purity of src/lib/translations.ts (+ translationsFill.ts):
//    an automated pass once wrote Spanish strings into the `en` and `de`
//    dictionaries. Score every literal and flag values whose language does not
//    match the block they live in.
// ---------------------------------------------------------------------------
const WORDS = {
  es: "el la los las un una unos unas de del que con para por se su sus tu tus no mas esta estan este esto puede debe crea genera sube elige elija cargar descargar guardar nuevo nueva sin lo le han fue son solo tambien cada todos todas desde hasta antes despues mientras aqui ahora bien mejor mismo otra otro pero si porque cuando donde como intenta favor correctamente video vídeo imagen escena creditos".split(" "),
  de: "der die das den dem des ein eine einen einem eines und oder nicht ist sind wird werden wurde kann kannst dein deine du dir mit zu fuer auf von im am beim keine kein bitte hier jetzt noch nur auch alle wie was wann wo weil aber schon mehr neu neue neues erstellen laden speichern hochladen szene".split(" "),
  en: "the a an is are was were be your you and with to for of in on at it this that not no failed please could can create start download save settings error video image new only more all from".split(" "),
};
const ES_MARKERS = /(ción\b|ciones\b|¿|¡|ñ|vídeo|está\b|más\b)/i;
const DE_MARKERS = /[äößÄÖ]|(?<![gq])ü/;

function scoreLanguages(value) {
  const tokens = (value.toLowerCase().match(/[a-zà-ÿ]+/g) || []);
  const count = (list) => tokens.filter((t) => list.includes(t)).length;
  return {
    es: count(WORDS.es) + 2 * (value.match(ES_MARKERS) ? 1 : 0),
    de: count(WORDS.de) + 2 * (value.match(DE_MARKERS) ? 1 : 0),
    en: count(WORDS.en),
  };
}

for (const file of ["src/lib/translations.ts", "src/lib/translationsFill.ts"]) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  let block = null;
  source.split("\n").forEach((line, i) => {
    // Block attribution must cover the three top-level dictionaries AND the
    // `translations.<lang>.<ns> = {` / `Object.assign(translations.<lang>…)`
    // add-on blocks appended at the end of the file. A bare `es: {` at any
    // indent would otherwise mis-attribute whole namespaces (it did).
    const head =
      line.match(/^\s*Object\.assign\(translations\.(en|de|es)\b/) ||
      line.match(/^\s*translations\.(en|de|es)(?:\.[A-Za-z0-9_]+)?\s*=/) ||
      line.match(/^ {2}"?(en|de|es)"?:\s*\{/);
    if (head) block = head[1];
    if (!block) return;

    const entry = line.match(/^\s*[A-Za-z0-9_]+:\s*(['"])(.{4,}?)\1,?\s*$/);
    if (!entry) return;
    const value = entry[2];
    const s = scoreLanguages(value);
    const wrong =
      (block === "de" && s.es >= 2 && s.es > s.de + s.en && "Spanish text in the German block") ||
      (block === "en" && s.es >= 2 && s.es > s.en + s.de && "Spanish text in the English block") ||
      (block === "es" && s.de >= 2 && s.de > s.es && "German text in the Spanish block");
    if (wrong) {
      problems.push(`${file}:${i + 1} ${wrong}: ${value.slice(0, 90)}`);
    }
  });
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`i18n consistency: ${unique.length} problem(s)`);
  unique.forEach((p) => console.error("  " + p));
  process.exit(1);
}
console.log("i18n consistency: OK");
