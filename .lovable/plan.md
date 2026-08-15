# v431 G3.1b — Endvertrag (Replicate-Kanal, Ledger-Attempts, Dispatch-Failure-Semantik)

## Klarstellung vorab: der Replicate-Kanal ist bereits verdrahtet

Der Kanal fehlte in meiner Zusammenfassung, nicht im Code:

- `compose-video-clips`: Ledger-Zeile entsteht VOR dem Provider-Dispatch je Szene (`stage: base_video`, `plate_generation` aus dem Run-Stempel eingefroren), die `pipeline_job_id` hängt in der Replicate-Webhook-URL (`sceneWebhookUrl()`), nach dem Dispatch wird die Prediction-ID gebunden.
- `compose-clip-webhook`: `observeCallbackProvenance()` läuft mit `stage: 'base_video'` vor jeder Statusverarbeitung, rein loggend.

## 1 — `plate_generation`: beim INSERT verpflichtend, danach vollständig immutable

Heutiger Stand: Spalte existiert, Trigger `composer_pipeline_jobs_identity_guard` sperrt `scene_id`, `run_id`, `stage`, `attempt_no`, `segment_id` hart und `external_job_id`/`plate_generation`, sobald gesetzt. Offen ist genau der von dir benannte Fall `NULL → Wert` für neue Zeilen.

Neuer DB-Vertrag (eine Migration):

- BEFORE INSERT: `plate_generation IS NULL` ⇒ Exception, sobald die Zeile nach dem G3.1-Stichtag entsteht (Stichtag als Konstante in der Triggerfunktion, Vergleich gegen `created_at`/`now()`).
- BEFORE UPDATE: `plate_generation` vollständig immutable für Post-Stichtag-Zeilen. Der einmalige Backfill `NULL → Wert` bleibt ausschließlich für Pre-Stichtag-Zeilen erlaubt; `Wert → anderer Wert` bleibt überall verboten.
- Konsequenz für den Dispatcher: `acquireLedgerJob()` wird fail-closed gegenüber fehlender Generation — ohne belastbare `plate_generation` wird keine Ledger-Zeile erzeugt (der Legacy-Pfad läuft in G3.1 weiter, das Fehlen wird als Telemetrie gezählt und im Drain-Bericht ausgewiesen).

## 2/3 — Dispatch-Failure: `failed` nur bei bewiesener Ablehnung, sonst `dispatch_uncertain`

Bestätigte Lücke: die Zeile entsteht vor dem Provider-Call und wird nur im Erfolgsfall über `bindLedgerExternalJob()` auf `dispatched` gehoben. Scheitert der Dispatch, bleibt sie auf `dispatching`.

Neuer Helper `settleLedgerDispatchFailure(admin, jobId, { errorCode, outcome })`:

- `outcome: 'rejected'` → `status = 'failed'`, `error_code`, `completed_at`. Nur bei nachweislicher Nicht-Annahme: HTTP-4xx-Ablehnung des Providers, Validierungsfehler, Abbruch **vor** dem Absenden des Requests.
- `outcome: 'uncertain'` → `status = 'dispatch_uncertain'` (recoverable, nicht terminal). Für Timeouts, abgebrochene Fetches, 5xx, unbekannte Antworten und jeden Fall, in dem der Provider den Auftrag angenommen haben könnte.
- Wirkt nur aus `pending`/`dispatching`, nie über `dispatched`/`succeeded` hinweg. Rührt ausschließlich `composer_pipeline_jobs` an — kein State-, Output-, Mirror- oder Credit-Effekt.

Reaper (korrigiert):

- Orphaned `dispatching`-Zeilen ohne `external_job_id` werden **nicht** auf `stale` gesetzt, sondern nach Ablauf des Fensters auf `dispatch_uncertain`. Der Function-Kill nach angenommener Provider-Anfrage bleibt damit callback-fähig.
- `stale` vergibt der Reaper nie von sich aus. `stale` entsteht nur mit positivem Beweis: ein Cancel-Pfad, ein Nachweis, dass kein Provider-Job existiert, oder ein neuer Attempt derselben Identität, der den alten laut Retry-Vertrag ausdrücklich ablöst.

## 4 — Retry-Dispatches sind eigene Ledger-Attempts

Nur die vier Initial-Dispatcher reichen nicht. Jeder neue Provider-Auftrag — auch aus Webhooks, Pollern und Watchdogs — bekommt VOR dem Dispatch eine eigene Zeile: gleiche `scene_id`/`run_id`/`stage`/`plate_generation`, `attempt_no + 1`, neue `pipeline_job_id`, die in die Callback-URL wandert. Der abgelöste Attempt wird nach dem Retry-Vertrag auf `stale` gesetzt (positiver Ablösebeweis, damit vertragskonform).

Zu verdrahtende Retry-/Re-Dispatch-Pfade (Inventar wird vor der Umsetzung final abgeglichen und im Bericht vollständig gelistet):

- `compose-clip-webhook` — Replicate-Auto-Retry bei transienten Fehlern (`MAX_AUTO_RETRY`).
- `sync-so-webhook` — Shot-Retry-Varianten (Frame-/Temperatur-/Coords-Fallback).
- `poll-dialog-shots` — Retry-Matrix des Pollers.
- `lipsync-watchdog` — Auto-Retry nach Provider-Timeout.
- `render-sync-segments-audio-mux` — erneuter Remotion-Invoke.

Ohne diese Pfade gäbe es trotz vollständiger Initialverdrahtung post-Deploy `missing_binding`-Callbacks aus Retry-Jobs; das Drain-Gate wäre nicht erfüllbar.

## 5 — Observe: neues Verdikt `binding_pending`

Ein Callback kann vor `bindLedgerExternalJob()` eintreffen. Ist die Ledger-Zeile über `pipeline_job_id` eindeutig gefunden, `external_job_id` aber noch `NULL`, wird das künftig als eigenes Verdikt `binding_pending` gezählt statt als `wrong_job`. `wrong_job` bleibt reserviert für widersprüchliche IDs (gesetzte, aber abweichende `external_job_id`, fremde `scene_id`/`stage`).

**Vorgemerkt als G3.2-Entscheidung (kein G3.1-Blocker):** ob der atomare Apply-RPC in genau diesem Zustand die externe Job-ID einmalig binden darf, oder ob eine nachgewiesene Provider-Garantie existiert, dass die Dispatch-Antwort immer vor dem Callback vorliegt. Die G3.1-Zählung von `binding_pending` liefert dafür die Datengrundlage.

## Observe bleibt read-only (verifiziert)

`observeCallbackProvenance()` führt ausschließlich `select` aus (Ledger-Zeile, danach `composer_scenes.active_run_id/plate_generation`) und loggt. Kein Update, kein RPC, kein Insert; kein Handler verzweigt auf dem Rückgabewert. Abgesichert durch einen Guard-Test gegen Schreibaufrufe im Modul und einen Test, der belegt, dass kein Handler das Observe-Ergebnis auswertet.

## Drain-Gate: Messbarkeit ist nicht Erfüllung

- Das Fenster startet erst mit dem Deploy des **vollständigen** Vertrages (alle Kanäle inkl. Retry-Attempts, Failure-Semantik, INSERT-Pflicht).
- Kriterium: 0 × `missing_binding` und 0 × `job_not_found` für Dispatches nach dem Deploy-Zeitstempel. Ältere in-flight-Callbacks werden über den Zeitstempel herausgefiltert. `binding_pending` wird gezählt und berichtet, blockiert das Gate aber nicht.
- Messung: Auswertung der `[v431] g31_observe`-Logzeilen je Handler plus Gegenprobe in `composer_pipeline_jobs` (Anteil Post-Deploy-Runs mit Ledger-Zeile je Stage).

## Reihenfolge

1. Migration: INSERT-Pflicht + volle Immutabilität für `plate_generation` (Stichtag), Reaper auf `dispatch_uncertain`.
2. `settleLedgerDispatchFailure()` mit `rejected`/`uncertain` und `binding_pending`-Verdikt im Shared-Modul.
3. Verdrahtung Initial-Dispatcher (`compose-video-clips`, `compose-dialog-segments`, `render-sync-segments-audio-mux`, `sync-so-webhook`) + alle Retry-Dispatcher aus dem Inventar.
4. DB-Smokes (INSERT-Pflicht, Immutabilität, `failed` vs. `dispatch_uncertain`, Reaper terminalisiert nicht, Retry erzeugt `attempt_no + 1` und setzt Vorgänger auf `stale`) + Guard-Tests (Observe read-only).
5. Deploy → Drain-Fenster → Bericht in `docs/v431-g3-1-report.md`. STOP; kein G3.2.
