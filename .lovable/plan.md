# Schritt 1 — Writer-Audit (Nachtrag) und Abschluss

Nur Bericht + der daraus folgende Abschluss von Schritt 1. Keine Arbeit an Capabilities (Schritt 2).

## Befund je Writer

| Writer | Schreibt `composer_scenes.clip_url`? | Szenen-/Render-Typ | Semantik | Drift möglich? |
|---|---|---|---|---|
| `compose-video-clips/index.ts:4002` | Ja | Szene mit `clipSource = "upload"` | base (Upload wird zur Plate) | Ja |
| `compose-video-clips/index.ts:4033` | Ja | Szene mit `clipSource = "stock"` | base (Stock-Clip als Plate) | Ja |
| `_shared/plate-attempt.ts:214` | **Nein** | — | Attempt-Protokoll | Nein |
| `generate-talking-head/index.ts:464` (+ `:645` Null-Write) | Ja | HeyGen-Talking-Head-Subszene | base (Provider-Plate) | Ja |
| `generate-composer-image-scene/index.ts:235` | Ja | Standbild-/Image-Szene | base (Standbild als Plate) | Ja |
| `_shared/autopilotComposerBridge.ts:170` | Ja (Insert **und** Update) | Autopilot-Brückenszene, `clip_source = "ai-hailuo"` | base (Plate vor Lip-Sync) | Ja |

Details:

- **`plate-attempt.ts:214` ist ein Fehlalarm aus dem Schritt-1-Bericht.** Der Update-Aufruf zielt auf die Tabelle `plate_attempts`, nicht auf `composer_scenes`. Diese Spalte ist reines Attempt-Protokoll für den Watchdog und kann die Output-Semantik nicht inkonsistent machen. Belegte Legacy-Ausnahme — bleibt unverändert.
- Alle übrigen vier Pfade setzen `clip_url` direkt und fassen `base_video_url` / `processed_video_url` nicht an. Ergebnis: eine Szene kann nach Schritt 1 mit gesetztem `clip_url`, aber leerem `base_video_url` dastehen. Der Resolver fängt das heute über den Legacy-Zweig ab (`clip_url` bei nicht-applied = base), aber damit bleiben zwei Output-Wahrheiten bestehen.
- Zusätzlich gefunden: `generate-talking-head/index.ts:645` setzt beim Dispatch `clip_url: null`, ohne die neuen Spalten zu nullen. Dort kann ein **veralteter** `base_video_url`/`processed_video_url` aus einem Vorlauf stehenbleiben — der gefährlichere Fall, weil der Resolver den alten Wert dann bevorzugt.
- `autopilotComposerBridge` hat einen Update-Pfad auf eine existierende Brückenszene (idempotenter Retry). Auch hier bleiben die neuen Spalten alt stehen.

## Antwort auf die Kernfrage

Schritt 1 ist **noch nicht** abgeschlossen. Vier produktive Pfade tragen Output-Drift weiter. Ein Pfad (`plate-attempt`) ist eine belegte Ausnahme.

## Umsetzung (Restarbeit Schritt 1)

Alle vier Pfade laufen über **denselben** in Schritt 1 eingeführten Materializer: `materializeCompatibilityOutput()` aus `supabase/functions/_shared/materialize-scene-output.ts`. Das ist keine neue Funktion, sondern exakt die bestehende (Datei = `materialize-scene-output.ts`, Export = `materializeCompatibilityOutput`). Es wird **kein zweiter Helper und keine zweite Output-Materialisierungslogik** angelegt — auch keine lokale Wrapper-Kopie in einer Function.

1. `compose-video-clips/index.ts` — Upload- und Stock-Zweig: `clip_url: …` ersetzen durch `...materializeCompatibilityOutput('base', { baseUrl: … })`, `clip_status` unverändert.
2. `generate-talking-head/index.ts` — Zeile 464 → `'base'`; Zeile 645 (Dispatch-Reset) → `'clear'`, im selben Update-Objekt (nullt `clip_url`, `base_video_url` und `processed_video_url` atomar).
3. `generate-composer-image-scene/index.ts` — Zeile 235 → `'base'`. `transitionScene(... 'plate_ready')` bleibt unangetastet.
4. `_shared/autopilotComposerBridge.ts` — das `row`-Objekt baut `clip_url` künftig über `'base'`, damit Insert **und** Update das vollständige Tripel schreiben.

Nicht angefasst: `plate-attempt.ts` (andere Tabelle), Snapshot-/Draft-/QA-Pfade, sämtliche Lip-Sync-Passes, Webhooks und Job-Guards.

## Tests

- Writer-Inventory-Test (`materializeSceneOutput.test.ts`) um die vier Dateien erweitern — und **nicht nur** auf das Literal `clip_url:` prüfen. Der Test stellt sicher, dass in diesen Runtime-Dateien keine direkte Mutation von `composer_scenes.clip_url` außerhalb des Materializers mehr möglich ist:
  - jedes `.from("composer_scenes")` mit `.update(`/`.insert(`/`.upsert(` muss ein Payload-Objekt verwenden, das `materializeCompatibilityOutput(` enthält;
  - jede Erwähnung von `clip_url` in einem Schreibpfad (auch Varianten wie `"clip_url":`, `clip_url =`, `[ 'clip_url' ]`, dynamisch gebaute Patch-Objekte) failt den Test, sofern sie nicht aus dem Materializer stammt.
- Ein Single-Source-Test: nur eine Datei im Repo definiert eine Output-Materialisierung (`materialize-scene-output.ts`); es existiert kein zweiter Export mit gleicher Aufgabe.
- Explizit dokumentierte Ausnahme für `plate_attempts.clip_url` im Test-Kommentar, damit sie nicht versehentlich mitmigriert wird.

## Reihenfolge

1. Restarbeit Schritt 1 implementieren.
2. Betroffene Edge-Functions deployen (`compose-video-clips`, `generate-talking-head`, `generate-composer-image-scene` sowie die Consumer des Bridge-Shared-Moduls).
3. Alle relevanten Suites + die 118 Lip-Sync-Anker-Tests + `tsgo`.
4. Writer-Inventory erneut prüfen.
5. STOP — Bericht. Schritt 2 startet nicht automatisch.

