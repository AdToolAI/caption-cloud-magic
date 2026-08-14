# v431 — G1: Einfache State-/Terminal-Pfade

G0 gilt als abgeschlossen und eingefroren. Der State-Core wird während G1 nicht mehr verändert
(Ausnahme: nachgewiesener G0-Regressionsbug). G1 migriert nur die einfachen, nicht
webhook-/fan-in-/watchdog-kritischen Legacy-State-Writer auf den G0-Vertrag.

## Schritt 0 — Repo-Parität der drei G0-Fixes

Bereits geprüft: alle drei Smoke-Fixes liegen als versionierte Migrationen im Repo
(`composer_recover_scene` Parameter-Shadowing, mehrdeutige `reason`-Referenz im Core,
Schreibziel `clip_error` statt `pipeline_error_text`) und der Smoke-Lauf ist ebenfalls
versioniert. In G1 wird das nur noch einmal als Diff DB-Funktion vs. Migrationsdatei
verifiziert und im Bericht bestätigt — keine neue Migration nötig, sofern der Diff leer ist.

## Schritt 1 — G1-Writer-Set festlegen (aus dem v431-Inventar)

Migriert werden diese semantischen Write-IDs:

| writeId | Rolle | Zielsemantik | Guard |
| --- | --- | --- | --- |
| `lipsync-fail:failed` | state | failed + `clip_error` atomar | run_bound |
| `cancel-dialog-lipsync:canceled` | state | canceled | run_bound, Fallback runless nur falls Regel existiert |
| `compose-video-clips:failed` (Zeile 1633) | state | failed + `clip_error` | run_bound |
| `generate-talking-head:failed` / `:failed-2` | state | failed + `clip_error` | run_bound |
| `report-lipsync-motion-probe:failed` | state | failed + `clip_error` | run_bound |
| `SceneCard:canceled` | state (UI) | canceled | über bestehende Cancel-Edge-Function statt Direktschreiben |

Ausdrücklich **nicht** in G1: `sync-so-webhook`, `remotion-webhook`, `compose-clip-webhook`,
`compose-dialog-segments`, `render-sync-segments-audio-mux`, `lipsync-watchdog`, `qa-watchdog`,
`recover-stuck-composer-clip`, `qa-weekly-deep-sweep`, `continuity-chain` (fan-in),
`autopilotComposerBridge` (fan-in), `useTwoShotAutoTrigger` (G5),
`hybrid-extend-scene` (bleibt Debt, Ziel G2 `run_bound`), Reverse-Bridge, Cast & World.

Vor jeder Umstellung wird der Writer klassifiziert (echter State-Write vs. reiner
Output-/Diagnose-/Reset-Write). Nur echte `state`/`substate`-Writes werden migriert; reine
Feld-Resets bleiben unverändert.

## Schritt 2 — Umstellung pro Writer

Pro Writer:

- Aufruf auf `transitionSceneV2()` mit stabiler `writeId` aus dem Inventar.
- Terminaler Failure schreibt Zustand **und** `clip_error` in einem Core-Aufruf
  (`_error_text`), kein separates Fehler-`update()` mehr.
- `run_bound` ist der Default. `runless` nur, wenn der Pfad im Betrieb ohne aktiven Run
  auftreten kann und eine bereits existierende Regel greift.
- **Keine neue `system_migration`-Signatur und keine neue Runless-Regel als Bypass.**
  Wenn ein Writer nur mit neuer Ausnahme migrierbar wäre: STOP und Rückfrage.
- Legacy-Spiegel (`clip_status`, `lip_sync_status`, `twoshot_stage`) nur soweit weiterführen,
  wie der bestehende Compatibility-Vertrag es noch verlangt.
- `SceneCard:canceled` schreibt keinen Zustand mehr direkt aus dem Client, sondern ruft den
  bestehenden Cancel-Pfad auf; sichtbare Cancel-Semantik bleibt identisch.

## Schritt 3 — Grandfathering verkleinern

Für jede erfolgreich migrierte Kante werden die zugehörigen Zeilen aus
`composer_transition_grandfather` entfernt (eine Migration, am Ende von G1, nach grünen Tests).
Die Tabelle muss monoton schrumpfen — kommt während G1 ein Eintrag hinzu, ist das ein
STOP-Signal statt einer Erweiterung des Compatibility-Korridors.

Ebenso wird die Allowlist im `scene-state-write-contract`-Test um die migrierten Stellen
verkleinert, und die Inventar-Fixture wird entsprechend fortgeschrieben.

## Schritt 4 — G1-Abnahme

- Writer-Inventar vorher/nachher (Zahlen je Rolle und Trigger).
- Liste der aus Grandfathering/`system_migration` entfernten semantischen Write-IDs.
- Contract-Scanner grün.
- Nachweis State-/Error-Atomizität (ein Statement, ein Audit-Eintrag pro Failure).
- Nachweis: keine neuen Runless-Ausnahmen.
- Bestehende Composer-Tests + `tsgo` grün.
- Lip-Sync-Frozen-Contract-Tests unverändert grün.
- Kleiner Smoke je migriertem Writer-Typ (Failure-Terminal, Cancel-Terminal, UI-Cancel).

Danach **STOP** und G1-Bericht. Kein G2 ohne neue Freigabe.

## Technische Notizen

- Vertragseinstieg bleibt `transitionSceneV2()` in `supabase/functions/_shared/scene-state.ts`
  (RPC `composer_scene_transition_v2` → `composer_scene_transition_core`).
- `failSceneState()` läuft heute über die Legacy-Fassade `composer_scene_transition/7`; die
  migrierten Failure-Pfade rufen stattdessen direkt `transitionSceneV2()` mit `_error_text`,
  damit Zustand und Fehlertext atomar sind. `failSceneState()` selbst bleibt für die noch
  nicht migrierten Gruppen unverändert.
- Betroffene Dateien: `supabase/functions/_shared/lipsync-fail.ts`,
  `supabase/functions/cancel-dialog-lipsync/index.ts`,
  `supabase/functions/compose-video-clips/index.ts`,
  `supabase/functions/generate-talking-head/index.ts`,
  `supabase/functions/report-lipsync-motion-probe/index.ts`,
  `src/components/video-composer/SceneCard.tsx`, plus Test-/Fixture-Dateien und eine
  Abschluss-Migration für das Grandfather-Trimmen.
