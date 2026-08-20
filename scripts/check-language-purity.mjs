#!/usr/bin/env node
/**
 * Language purity guard for the dictionaries.
 *
 * Detects entries whose text is written in a different language than the block
 * they live in (`de` / `en` / `es`), across the main blocks AND the
 * `Object.assign(translations.X, {...})` / `translations.X.y = {...}` add-ons
 * that the old tx()-only check never looked at.
 *
 * Usage: node scripts/check-language-purity.mjs
 * Exit code 1 = contamination found.
 */
import { readFileSync } from "node:fs";

const FILES = ["src/lib/translations.ts", "src/lib/translationsFill.ts"];

/** Strong, unambiguous markers per language. */
const MARKERS = {
  es: /(vídeo|víd\b|está\b|están\b|función|funciones|¿|¡|ción\b|ciones\b|créditos|Historial|Error al |No se pudo|Inténtalo|exitosa|exitoso|Elige |Elija |escena|escenas|Subido|Añadir|Añade|Introducir|Atrás|Haga clic|Haz clic|Guardando|Actualizar ahora|conexión|conexiones|publicación|Por favor|Configuración|Descripción|Duración|Resolución|Reintentar|Eliminar|Restablecer|Agregar|Comprar |ilimitad|Vista previa|Proporción|Ninguna\b|Ninguno\b|Velocidad\b)/,
  de: /(ä|ö|ü|ß|\b(nicht|wurde|wird|deine|dein|deinen|Deine|Dein|kannst|Du kannst|erstellen|erstellt|Einstellungen|Fehler beim|Bitte|Zurück|Speichern|Löschen|Hinzufügen|hochladen|Vorschau)\b)/,
  // Kept narrow on purpose: German UI copy legitimately uses loanwords like
  // "Upload", "Preview", "Team" — only sentence-level English is a smell.
  en: /\b(the|your|please|could not|failed to|will be|has been)\b/i,
};

// Accepts both source-style (`key: 'value'`) and generated JSON-style
// (`"key": "value"`) entries — translationsFill.ts is machine-written.
const ENTRY = /^(\s*)"?([A-Za-z0-9_]+)"?(:\s*)('|")((?:\\.|(?!\4)[^\\])*)\4(,?\s*)$/;

/** Values that legitimately look the same in every language. */
const NEUTRAL =
  /^[\p{P}\p{S}\s\d]*$|^(Prompt|Credits|Sora 2|TikTok|YouTube|LinkedIn|Instagram|Facebook|Standard|Timing|Properties|Snap on|Snap off|HD|4K|MP4|Basic|Pro|Beta|OK|Team|Status|Import|Export|Start|Stop|Reset|Info|Login|Logout)$/u;

function langAt(lines) {
  const map = new Array(lines.length).fill(null);
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m =
      /^Object\.assign\(translations\.(de|en|es)\b/.exec(l) ||
      /^\s*translations\.(de|en|es)\.[A-Za-z0-9_]+\s*=/.exec(l) ||
      /^\s*translations\.(de|en|es)\s*=/.exec(l);
    if (m) cur = m[1];
    else if (/^  "?(de|en|es)"?: \{/.test(l)) cur = /^  "?(de|en|es)/.exec(l)[1];
    map[i] = cur;
  }
  return map;
}

/** Intentional cross-language copy (brand phrasing, marketing headlines). */
const ALLOW = new Set([
  "z.B. Behind-the-Scenes Cut",
  "p.ej. Corte Behind-the-Scenes",
  "wins the game",
]);

const problems = [];

for (const file of FILES) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = source.split("\n");
  const langs = langAt(lines);

  lines.forEach((line, i) => {
    const lang = langs[i];
    if (!lang) return;
    const m = ENTRY.exec(line);
    if (!m) return;
    const value = m[5];
    if (!value || NEUTRAL.test(value.trim()) || ALLOW.has(value.trim())) return;

    for (const [other, marker] of Object.entries(MARKERS)) {
      if (other === lang) continue;
      // Only flag foreign text that does NOT also look like the declared language.
      if (marker.test(value) && !MARKERS[lang].test(value)) {
        problems.push(
          `${file}:${i + 1} [${lang}] "${m[2]}" looks like ${other}: ${value.slice(0, 100)}`,
        );
        break;
      }
    }
  });
}

if (problems.length) {
  console.error(`Language contamination found (${problems.length}):\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nEvery value must be written in the language of its block (de / en / es).",
  );
  process.exit(1);
}

console.log("Language purity check passed.");
