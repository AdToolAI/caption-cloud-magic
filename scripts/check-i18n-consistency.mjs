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
      if (!/toLocale(Date|Time)?String|DateTimeFormat/.test(line)) return;
      for (const rule of BAD_TECHNICAL) {
        if (rule.test(line)) {
          problems.push(`${file}:${i + 1} translated Intl option: ${line.trim().slice(0, 120)}`);
        }
      }
    });
  }
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`i18n consistency: ${unique.length} problem(s)`);
  unique.forEach((p) => console.error("  " + p));
  process.exit(1);
}
console.log("i18n consistency: OK");
