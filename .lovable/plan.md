# v431 — Vorbereitungsauftrag (nur Analyse, keine Writer-Änderung)

v430 / v430.1 gelten als eingefroren. Dieser Auftrag erzeugt ausschließlich Dokumentation und Inventar als Grundlage für den späteren v431-Refactor. Es wird kein Writer umgestellt und die Reverse-Bridge bleibt aktiv.

## Ziel

Ein belastbares Migrationsdossier, das für jeden Legacy-Lip-Sync-Write sagt: was schreibt er heute, worauf mappt er in der `pipeline_state` / `pipeline_substate`-Welt, und in welcher Migrationsgruppe er später angefasst wird.

## Lieferungen

### 1. Legacy-Write-Inventar mit Zustands-Mapping
Vollständige Tabelle aller Legacy-Lip-Sync-Writes (Felder wie `lipsync_status`, `lip_sync_job_id`, `lip_sync_video_url`, `processed_video_url`, `lipsync_provider`) mit Spalten:
Datei + Zeile, Feldsatz, Auslöser (Webhook / Watchdog / UI / Cron), heutiger Legacy-Wert, Ziel `pipeline_state`, Ziel `pipeline_substate`, ob der Wert verlustfrei ableitbar ist, Risikoklasse.

Schwerpunkt-Writer laut Vorab-Scan: `compose-dialog-segments`, `compose-video-clips`, `sync-so-webhook`, `lipsync-watchdog`, `compose-clip-webhook`, `remotion-webhook`, `render-sync-segments-audio-mux`, `cancel-dialog-lipsync`, `compose-twoshot-audio`, `composer-cancel-scene`, `composer-cancel-project` sowie clientseitig `useTwoShotAutoTrigger`, `ClipsTab`, `useRenderQueueLive`, `usePipelineProgress`, `VideoComposerDashboard`.

Jede Zeile bekommt eine der Kennzeichnungen: **1:1 ableitbar**, **ableitbar mit Zusatzkontext**, **kein Ziel-Zustand vorhanden (Vertragslücke)**.

### 2. Klärung der roten `scene-state-write-contract`-Befunde
Der Vertragstest erlaubt derzeit nur `scene-hard-reset.ts`, `scene-state.ts` und die Testdatei. Direkte `pipeline_state`-Schreibvorgänge bestehen aktuell u. a. in:
`qa-watchdog` (4 Stellen: failed / canceled), `recover-stuck-composer-clip` (failed), `compose-video-clips` (failed), `qa-weekly-deep-sweep` (plate_ready), `motion-studio-superuser` (2× plate_ready), `hybrid-extend-scene` (idle), `continuity-chain` (queued / failed), `autopilotComposerBridge` (plate_ready).

Für jede Stelle wird entschieden und begründet: Umstellung auf `transitionScene()` / `failSceneState()`, oder dokumentierte Ausnahme mit Aufnahme in die Allowlist (z. B. Recovery-Pfade ohne gültigen Vorzustand). Schwerpunkt wie gefordert auf `qa-watchdog` und `recover-stuck-composer-clip`. Keine Codeänderung in diesem Auftrag — nur die Entscheidung samt Zielzustand des Tests.

### 3. Die 8 Legacy-Output-Randzeilen
Dokumentation der bekannten Randfälle aus dem v430-Audit: Szenen-ID-Klasse, Feldkonstellation, warum `resolveSceneOutput()` heute abweicht, und ob eine Datenkorrektur, eine Resolver-Regel oder bewusstes Belassen die richtige Antwort ist.

### 4. `compose-video-assemble` → `resolveSceneOutput()`
Einordnung als möglicher kleiner Cleanup: heutige URL-Auswahl im Assemble-Pfad, Abweichungen gegenüber der geteilten Resolver-Logik, Aufwand, Risiko für Export-Parität und Empfehlung (eigene Mini-Phase vor oder nach der Writer-Migration).

### 5. Migrationsgruppen
Festlegung der Reihenfolge, in der Lip-Sync-Writer gefahrlos migriert werden, jeweils mit Abbruchkriterium und Nachweis:

```text
G1  Terminal-/Fehlerpfade (cancel-*, watchdogs, recover)   - geringstes Risiko
G2  Webhook-Endzustände (sync-so, compose-clip, remotion)  - Kern der Lip-Sync-Kette
G3  Mux-/Assembly-Writer (audio-mux, twoshot, assemble)    - Ausgabe-Parität kritisch
G4  Client-Reader/Writer (Hooks + UI)                      - erst nach G1-G3
G5  Reverse-Bridge abschalten                              - letzter Schritt, separat
```

## Ergebnisartefakt

Ein Dokument `docs/v431-prep-inventory.md` mit den Abschnitten 1–5. Zusätzlich ein maschinenlesbares Inventar als Testfixture, damit spätere Phasen gegen eine eingefrorene Ausgangsmenge prüfen können (analog zum v430.1-Gate-Scanner) — reines Lesen, keine Verhaltensänderung.

## Abgrenzung

- Kein Writer wird umgestellt.
- Die Reverse-Bridge bleibt unverändert aktiv.
- Keine Migration, keine Datenkorrektur an den 8 Randzeilen.
- Am Ende: STOP mit Bericht, danach Phasenfreigabe Gruppe für Gruppe.
