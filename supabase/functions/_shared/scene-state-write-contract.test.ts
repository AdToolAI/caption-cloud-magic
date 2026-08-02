/**
 * v388 — Vertragstest: EIN Schreibpfad für `pipeline_state`.
 *
 * Der Zustand einer Szene darf ausschließlich über `composer_scene_transition()`
 * wechseln (Wrapper: `transitionScene` / `failSceneState` in `scene-state.ts`).
 * Ein direktes `.update({ pipeline_state: ... })` umgeht Zeilensperre,
 * Übergangstabelle, Lauf-/Generationsabgleich und Protokoll — genau darüber
 * sind fehlgeschlagene Szenen früher wieder in den Lip-Sync gerutscht.
 *
 * Seit v388 weist der DB-Wächter solche Schreibvorgänge ohnehin zurück. Dieser
 * Test fängt sie eine Ebene früher ab: beim Build, statt zur Laufzeit.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

/** Nur der Reset darf den Zustand erzwingen — er ist der einzige Zwangsschreiber. */
const ALLOWED = new Set<string>([
  "supabase/functions/_shared/scene-hard-reset.ts",
  "supabase/functions/_shared/scene-state.ts",
  "supabase/functions/_shared/clip-terminal-failure.ts",
  "supabase/functions/_shared/scene-state-write-contract.test.ts",
]);

const ROOT = new URL("../../../", import.meta.url).pathname;

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      yield* walk(path);
    } else if (entry.isFile && entry.name.endsWith(".ts")) {
      yield path;
    }
  }
}

Deno.test("v388 — kein direkter pipeline_state-Schreibvorgang ausserhalb des Resets", async () => {
  const offenders: string[] = [];

  for await (const abs of walk(`${ROOT}supabase/functions`)) {
    const rel = abs.slice(ROOT.length);
    if (ALLOWED.has(rel)) continue;

    const src = await Deno.readTextFile(abs);
    const lines = src.split("\n");

    lines.forEach((line, idx) => {
      // `pipeline_state: "..."` als Objektfeld eines Schreibvorgangs.
      // Lesende Verwendungen (Select-Listen, Diagnose-Objekte mit Variablen)
      // treffen dieses Muster nicht.
      if (!/^\s*pipeline_state:\s*"[a-z_]+"\s*,?\s*$/.test(line)) return;

      // Ein INSERT legt eine neue Zeile an — dort gibt es keinen Vorzustand,
      // über den ein Übergang laufen könnte.
      const context = lines.slice(Math.max(0, idx - 25), idx).join("\n");
      if (/\.insert\(/.test(context) && !/\.update\(/.test(context)) return;

      offenders.push(`${rel}:${idx + 1}`);
    });
  }

  assertEquals(
    offenders,
    [],
    `Direkte pipeline_state-Schreibvorgaenge gefunden — bitte auf transitionScene() ` +
      `bzw. failSceneState() umstellen:\n  ${offenders.join("\n  ")}`,
  );
});
