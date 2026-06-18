# Plan: Preflight 404 "pass_not_found" beheben

## Was ich gemessen habe

- DB-Check für die im Screenshot gezeigte Szene `5813e9bb-30e1-4569-b469-2b78121af3ec`:
  - `clip_status = ready`, `lip_sync_status = failed`
  - `dialog_shots` ist ein Objekt, `dialog_shots.passes` ist ein Array mit **4 Einträgen**, `current_pass = 0`.
- Quellcode `supabase/functions/syncso-preflight/index.ts` (v129.23.0) liest exakt diese Struktur (`scene.dialog_shots?.passes ?? []`) und sollte `passes[0]` problemlos finden.
- Die UI bekommt aber HTTP 404 mit Body `{"error":"pass_not_found"}` zurück (Toast + roter Block + "Blocker erkannt: unknown" weil `verdict='fail'` im Catch-Pfad gesetzt wird).
- In den Edge-Function-Logs für `syncso-preflight` taucht **keine einzige Zeile** unserer Version auf (weder "v129", noch "preflight", noch "scene"). Das passt zur Hypothese, dass die letzte Deployment-Runde der Function nicht durchkam (Source ist v129.23.0, die Live-Function ist offenbar älter und/oder loggt nichts).

## Was ich ändern will

### 1. `supabase/functions/syncso-preflight/index.ts` — minimal-invasive Diagnose

Direkt nach dem Body-Parsing (vor dem `composer_scenes`-Select) eine einzige Log-Zeile, damit wir bei der nächsten Forensik-Öffnung in den Logs sehen, was die deployte Version wirklich macht:

```ts
console.log(
  `[syncso-preflight] v129.23.1 sceneId=${sceneId} passIndex=${passIndex}`,
);
```

Direkt nach `const passes = scene.dialog_shots?.passes ?? [];` zusätzlich:

```ts
console.log(
  `[syncso-preflight] v129.23.1 passes_resolved=${Array.isArray(passes) ? passes.length : "non-array:" + typeof passes} dialog_shots_type=${typeof scene.dialog_shots}`,
);
```

Und im 404-Return die Info mitgeben, damit der UI-Banner mehr sagt als nur "unknown":

```ts
if (!pass) {
  return json(
    { error: "pass_not_found", available: passes.length, scene_has_dialog_shots: !!scene.dialog_shots, dialog_shots_keys: scene.dialog_shots ? Object.keys(scene.dialog_shots) : [] },
    404,
  );
}
```

Version-String unten auf `"v129.23.1"` ziehen, damit wir in der UI sofort sehen, ob die neue Version live ist (heute zeigt sie weiterhin `v129.23.0` — also nicht aktualisiert).

### 2. Function neu deployen

`syncso-preflight` per `supabase--deploy_edge_functions` erneut deployen. Wenn der Deploy mit 500/Internal failt, `deno.lock` der Function prüfen/entfernen (siehe Lovable-Hinweis "Edge Function Deploy Troubleshooting") und nochmal deployen.

### 3. Verifikation

1. Nach Deploy direkt einmal `syncso-preflight` invoke testen (curl mit Admin-JWT ist sandbox-seitig nicht möglich, deshalb über die UI).
2. Edge-Function-Logs lesen: erwartete Zeile `v129.23.1 sceneId=5813e9bb-… passIndex=0 … passes_resolved=4`.
3. Bei `passes_resolved=4` muss die UI `verdict !== 'fail'` zeigen → Preflight-Checks werden ausgeführt.
4. Bei `passes_resolved=0` oder `non-array:…` wissen wir, dass das deployte Postgrest-Result anders aussieht als unsere SQL-Probe — dann ziehen wir den Select auf `dialog_shots->'passes'` explizit um. Aktuell ist das **nicht** Teil des Plans, weil unsere DB-Probe sauber ein Array zurückliefert.

### 4. UI: kein Code-Change geplant

Der Forensik-Sheet-Renderer ist korrekt. Wenn nach Deploy `available` mit im 404 kommt, wird `result.error` immer noch "pass_not_found" zeigen, aber der Debug-Inhalt steht im Detail-JSON unter dem Sheet (Bundle / Replay-Sektion zeigen das Raw-Result). Optional könnten wir die `available`-Zahl klein anhängen ("pass_not_found · 0/4 verfügbar"), das ist aber nur kosmetisch und kann nach der Diagnose dazukommen.

## Kosten / Risiko

- Keine Migration, keine Wallet-/Credit-Pfade berührt.
- Reiner Edge-Function-Redeploy + 2 console.log + 1 erweitertes Fehlerobjekt.
- Keine Änderung an `compose-dialog-segments`, an Sync.so-Dispatch oder am DB-Schema.

## Was ich **nicht** anfasse

- Die Dispatch-Logik / Auto-Snap (v129.23 bleibt unverändert).
- `dialog_shots`-Struktur / Migrations.
- Forensik-Sheet-Logik außer optional ein kleines `available`-Suffix nach der Diagnose.
