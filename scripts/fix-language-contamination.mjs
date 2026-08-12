#!/usr/bin/env node
/**
 * One-off repair: find entries in the `de` / `en` translation blocks whose
 * value is actually Spanish (fallout from an old bulk-translation run) and
 * rewrite them into the declared language via the Lovable AI Gateway.
 *
 * Usage: LOVABLE_API_KEY=... node scripts/fix-language-contamination.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILES = ["src/lib/translations.ts", "src/lib/translationsFill.ts"];
const DRY = process.argv.includes("--dry");
const KEY = process.env.LOVABLE_API_KEY;
if (!KEY && !DRY) throw new Error("LOVABLE_API_KEY missing");

const STRONG_ES =
  /(vídeo|víd\b|está\b|están\b|función|funciones|¿|¡|ción\b|ciones\b|créditos|Historial|saldo|Error al |No se pudo|Inténtalo|exitosa|exitoso|Elige |Elija |Escena|escena |escenas|Subido|Subir |Añadir|Añade|Introducir|Atrás|Cerrar |Abrir |Haga clic|Haz clic|Guardando|Cargando|Actualizar ahora|conexión|conexiones|Conecta |publicación|Selecciona|selecciona|Por favor|previa del|de la |de los |para el |para la |con la |una nueva|Configuración|Descripción|Duración|Resolución|Reintentar|Eliminar|Restablecer|Agregar|agregó|Generar |Comprar |Sin conexiones|ilimitad|Calidad|Vista previa|Fondo\b|Proporción|Ninguna\b|Ninguno\b|Velocidad\b|Estándar\b|Ajustes\b|créd)/;

/** Track which language object a line belongs to. */
function langAt(lines) {
  const map = new Array(lines.length).fill(null);
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m =
      /^Object\.assign\(translations\.(de|en|es)\b/.exec(l) ||
      /^\s*translations\.(de|en|es)\.[A-Za-z0-9_]+\s*=/.exec(l) ||
      /^\s*translations\.(de|en|es)\s*=/.exec(l);
    if (m) cur = m[1];
    else if (/^  (de|en|es): \{/.test(l)) cur = /^  (de|en|es)/.exec(l)[1];
    map[i] = cur;
  }
  return map;
}

const ENTRY = /^(\s*)([A-Za-z0-9_]+)(:\s*)('|")((?:\\.|(?!\4)[^\\])*)\4(,?\s*)$/;

const jobs = [];
const fileState = [];

for (const file of FILES) {
  const lines = readFileSync(file, "utf8").split("\n");
  const langs = langAt(lines);
  fileState.push({ file, lines });
  lines.forEach((line, i) => {
    const lang = langs[i];
    if (lang !== "de" && lang !== "en") return;
    const m = ENTRY.exec(line);
    if (!m) return;
    const value = m[5];
    if (!STRONG_ES.test(value)) return;
    jobs.push({ file, index: i, lang, key: m[2], value, match: m });
  });
}

console.log(`candidates: ${jobs.length}`);
if (DRY) {
  for (const j of jobs) console.log(`[${j.lang}] ${j.file}:${j.index + 1} ${j.key} = ${j.value}`);
  process.exit(0);
}

const SYSTEM = `You repair a UI translation file. Each item has a target language ("de" = German, "en" = English) and a current value that may be Spanish text placed in the wrong language block.
Rules:
- Return the value written correctly in the target language, keeping the exact same meaning.
- Preserve placeholders verbatim: {name}, {count}, {time}, {percent}, {preset}, {score}, {credits}, {style}, {n}, {index}, {type}, {size}, {canal}, {horas} etc. If a placeholder name was translated (e.g. {canal}, {horas}, {plataforma}), keep it EXACTLY as given — do not rename.
- Preserve leading/trailing emoji, punctuation, arrows (→), ellipses and escape sequences (\\" and \\') exactly as in the input.
- Keep product/technical terms untouched: Sora 2, TikTok, YouTube, LinkedIn, Playhead, Snap, Color Grading, Voice-Over, Upscaling, Credits, Prompt, Director's Cut, Universal Creator, HD, MP4.
- If the value is ALREADY correct in the target language, return it unchanged.
Return strict JSON: {"items":[{"i":<number>,"v":"<value>"}]} covering every input item, nothing else.`;

async function translate(batch) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: JSON.stringify(
            batch.map((b) => ({ i: b.i, lang: b.lang, key: b.key, value: b.value })),
          ),
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return parsed.items || [];
}

const BATCH = 25;
const results = new Map();
for (let start = 0; start < jobs.length; start += BATCH) {
  const slice = jobs.slice(start, start + BATCH).map((j, k) => ({
    i: start + k,
    lang: j.lang,
    key: j.key,
    value: j.value,
  }));
  let items;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      items = await translate(slice);
      break;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  for (const it of items) if (typeof it.v === "string") results.set(it.i, it.v);
  console.log(`translated ${Math.min(start + BATCH, jobs.length)}/${jobs.length}`);
}

let changed = 0;
jobs.forEach((j, idx) => {
  const v = results.get(idx);
  if (v === undefined || v === j.value) return;
  const state = fileState.find((f) => f.file === j.file);
  const [, indent, key, sep, quote, , tail] = j.match;
  const escaped = v.replace(/\\/g, "\\\\").replace(new RegExp(quote, "g"), `\\${quote}`);
  state.lines[j.index] = `${indent}${key}${sep}${quote}${escaped}${quote}${tail}`;
  changed++;
});

for (const { file, lines } of fileState) writeFileSync(file, lines.join("\n"));
console.log(`rewritten: ${changed}`);
