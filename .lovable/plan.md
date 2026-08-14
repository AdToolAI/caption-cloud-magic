# v431 — Vorbereitungsauftrag (nur Analyse, keine Writer-Änderung)

v430 / v430.1 gelten als eingefroren. Dieser Auftrag erzeugt ausschließlich Dokumentation und Inventar als Grundlage für den späteren v431-Refactor. Es wird kein Writer umgestellt und die Reverse-Bridge bleibt aktiv.

## Ziel

Ein belastbares Migrationsdossier, das für jede Legacy-Schreibstelle sagt: welche Rolle sie hat, ob überhaupt ein Zustandswechsel gemeint ist, unter welchem Guard sie schreibt, und in welcher Migrationsgruppe sie später angefasst wird.

## Lieferungen

### 1. Legacy-Write-Inventar mit Rolle, Mapping und Run-Semantik

Vollständige Tabelle aller Legacy-Lip-Sync-Schreibstellen (`lipsync_status`, `lip_sync_job_id`, `lip_sync_video_url`, `processed_video_url`, `lipsync_provider` u. a.).

Jede Zeile bekommt eine **stabile semantische ID** statt einer Zeilennummer, Form `<writer>:<semantik>`:

```text
syncso-webhook:final-mux-complete
compose-dialog-segments:dispatch-running
lipsync-watchdog:timeout-failed
```

Zeilennummern werden nur zusätzlich als Fundstelle geführt (volatil, nicht Schlüssel).

Spalten je Zeile:

| Spalte | Bedeutung |
| --- | --- |
| `id` | stabile semantische ID (Schlüssel) |
| `file` / `line` | Fundstelle, volatil |
| `write_role` | `state` \| `substate` \| `output` \| `job_metadata` \| `diagnostic` |
| `fields` | geschriebener Feldsatz |
| `trigger` | Webhook / Watchdog / UI / Cron / Fan-in |
| `legacy_value` | heutiger Wert |
| `target_state` | Ziel `pipeline_state` — bei `output`/`job_metadata`/`diagnostic` ausdrücklich **„kein State-Wechsel"** |
| `target_substate` | Ziel `pipeline_substate` bzw. „kein State-Wechsel" |
| `derivable` | 1:1 ableitbar / mit Zusatzkontext / Vertragslücke |
| `run_guard` | prüft der Writer `active_run_id`, `plate_generation`, Job-ID? |
| `atomic_with` | wird der State atomar mit dem Output geschrieben (ja/nein, welche Felder) |
| `idempotency` | verhält sich ein Doppel-Callback neutral? |
| `callback_risk` | Race-/Spät-Callback-Risiko (out-of-order, veralteter Run, paralleler Retry) |
| `risk_class` | Migrationsrisiko |

Nur `state` und `substate` brauchen zwingend ein State-Mapping. Für `output`, `job_metadata` und `diagnostic` wird ausdrücklich vermerkt, dass kein Zustandsübergang gemeint ist — damit v431 später keinem Metadaten-Write künstlich einen `pipeline_state` verpasst.

Schwerpunkt-Writer laut Vorab-Scan: `compose-dialog-segments`, `compose-video-clips`, `sync-so-webhook`, `lipsync-watchdog`, `compose-clip-webhook`, `remotion-webhook`, `render-sync-segments-audio-mux`, `cancel-dialog-lipsync`, `compose-twoshot-audio`, `composer-cancel-scene`, `composer-cancel-project` sowie clientseitig `useTwoShotAutoTrigger`, `ClipsTab`, `useRenderQueueLive`, `usePipelineProgress`, `VideoComposerDashboard`. Besondere Sorgfalt bei `sync-so-webhook`, `remotion-webhook` und dem Mux-Pfad: dort zählt nicht nur *welcher* State geschrieben wird, sondern *wann* und *unter welchem Guard*.

### 2. Klärung der roten `scene-state-write-contract`-Befunde

Der Vertragstest erlaubt derzeit nur `scene-hard-reset.ts`, `scene-state.ts` und die Testdatei. Direkte `pipeline_state`-Schreibvorgänge bestehen aktuell u. a. in:
`qa-watchdog` (4 Stellen: failed / canceled), `recover-stuck-composer-clip` (failed), `compose-video-clips` (failed), `qa-weekly-deep-sweep` (plate_ready), `motion-studio-superuser` (2× plate_ready), `hybrid-extend-scene` (idle), `continuity-chain` (queued / failed), `autopilotComposerBridge` (plate_ready).

Jede Stelle wird in **genau eine von drei** Kategorien eingeordnet:

1. **Normale legale Transition** → gehört auf `transitionScene()`.
2. **Terminales Failure** → gehört auf `failSceneState()`.
3. **Recovery-Override erforderlich** → die bestehende State-Machine kann den legitimen Recovery-Fall nicht ausdrücken. Das wird als **Vertragslücke** dokumentiert, nicht als dauerhafte Allowlist-Erlaubnis. Für diese Fälle wird ein späterer, expliziter und getesteter Recovery-Primitive skizziert.

   „Beliebiger/inkonsistenter Vorzustand" bedeutet dabei ausdrücklich **nicht** „ungeprüfter Force-Write". Das Dossier schreibt als Pflichtbedingungen des Primitives mindestens fest:
   - Abgleich gegen `active_run_id` / `plate_generation` bzw. einen vorhandenen Run-Ledger-Eintrag,
   - Zielzustand ausschließlich `failed` oder `canceled`,
   - maschinenlesbarer Recovery-Grund (Enum, kein Freitext),
   - Audit-/Logging-Pflicht mit Vorzustand, Zielzustand und Auslöser.

   Ohne diese Bedingungen wäre der Primitive nur ein schöner benannter Bypass.


`qa-watchdog` und `recover-stuck-composer-clip` sind die Hauptkandidaten für Kategorie 3 und werden explizit begründet. Kein direkter `pipeline_state`-Write wird in diesem Auftrag dauerhaft allowlistet; eine Allowlist-Eintragung ist höchstens temporär und trägt dann die Kategorie-3-Markierung.

### 3. Die 8 Legacy-Output-Randzeilen

Dokumentation der bekannten Randfälle aus dem v430-Audit: Szenen-ID-Klasse, Feldkonstellation, warum `resolveSceneOutput()` heute abweicht, und ob Datenkorrektur, Resolver-Regel oder bewusstes Belassen die richtige Antwort ist.

### 4. Eigener Track: `compose-video-assemble` → `resolveSceneOutput()`

Kein Teil einer Writer-Gruppe — es ist ein **Output-Reader-Cleanup** und steht als eigener kleiner Track im Dossier. Inhalt: heutige URL-Auswahl im Assemble-Pfad, Abweichungen gegenüber der geteilten Resolver-Logik, Aufwand, Risiko für Export-Parität, Empfehlung zur Einordnung (unabhängig von der Writer-Migration, voraussichtlich vor dem Abschalten der Reverse-Bridge).

### 5. Migrationsgruppen

```text
G0  State-/Recovery-Verträge vervollständigen
    transitionScene / failSceneState / ggf. Recovery-Primitive
G1  Einfache terminale UI-/Cancel-Pfade
    cancel-dialog-lipsync, explizite Failure-Helper
G2  Audio-/Dispatch-Zwischenzustände
    compose-twoshot-audio, Dispatch-/Start-Pfade
G3  Webhooks + Mux/Fan-in
    sync-so-webhook, remotion-webhook, compose-dialog-segments, audio-mux
G4  Watchdog/Recovery
    erst nachdem dieselben States durch G1-G3 sauber geschrieben werden
G5  verbleibende Client-/Compatibility-Pfade
G6  Reverse-Bridge global abschalten

Eigener Track (parallel, nicht Teil von G0-G6):
T1  compose-video-assemble -> resolveSceneOutput() (Output-Reader-Cleanup)
```

Watchdog/Recovery ist bewusst spät: die Läufe sind selten, treffen aber genau die kaputten und race-lastigen Zustände. Jede Gruppe bekommt Abbruchkriterium und Nachweis.

## Ergebnisartefakt

- `docs/v431-prep-inventory.md` mit den Abschnitten 1–5.
- Maschinenlesbares Inventar als Testfixture, geschlüsselt über die stabilen semantischen IDs (analog zum v430.1-Gate-Scanner). Die Fixture friert **alle** Legacy-Writes ein, der spätere Guard unterscheidet aber nach `write_role`: ein neuer `job_metadata`- oder `output`-Write ist **nicht** automatisch ein neuer Legacy-State-Writer. Erzwungen wird primär: **keine neue `state`/`substate`-Write-ID ohne Aufnahme ins Inventar** — diese Rollen sind für die spätere Bridge-Abschaltung entscheidend. Output- und Metadaten-Writes werden separat bewertet und blockieren die Bridge-Abschaltung nicht automatisch. In diesem Auftrag wird die Fixture nur erzeugt und gegen den Ist-Stand eingefroren — reines Lesen, keine Verhaltensänderung.

## Abgrenzung

- Kein Writer wird umgestellt, kein Recovery-Primitive gebaut.
- Die Reverse-Bridge bleibt unverändert aktiv.
- Keine Migration, keine Datenkorrektur an den 8 Randzeilen.
- Keine dauerhafte Allowlist-Erweiterung im Vertragstest.
- Am Ende: STOP mit Bericht + Fixture; G0/G1 erst nach separater Freigabe.
