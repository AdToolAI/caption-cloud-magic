# v431 G3.1b — Endvertrag (Replicate-Kanal, Ledger-Attempts, Dispatch-Failure-Semantik)

## Klarstellung vorab: der Replicate-Kanal ist bereits verdrahtet

Der Kanal fehlte in meiner Zusammenfassung, nicht im Code:

- `compose-video-clips`: Ledger-Zeile entsteht VOR dem Provider-Dispatch je Szene (`stage: base_video`, `plate_generation` aus dem Run-Stempel eingefroren), die `pipeline_job_id` hängt in der Replicate-Webhook-URL (`sceneWebhookUrl()`), nach dem Dispatch wird die Prediction-ID gebunden.
- `compose-clip-webhook`: `observeCallbackProvenance()` läuft mit `stage: 'base_video'` vor jeder Statusverarbeitung, rein loggend.

## 1 — `plate_generation`: beim INSERT verpflichtend, danach vollständig immutable

Heutiger Stand: Spalte existiert, Trigger `composer_pipeline_jobs_identity_guard` sperrt `scene_id`, `run_id`, `stage`, `attempt_no`, `segment_id` hart und `external_job_id`/`plate_generation`, sobald gesetzt. Offen ist genau der von dir benannte Fall `NULL → Wert` für neue Zeilen.

Neuer DB-Vertrag (eine Migration), ohne `created_at`-Bypass:

- BEFORE INSERT: ab Aktivierung der Migration gilt für **jeden** neuen INSERT `NEW.plate_generation IS NOT NULL` — keine Ausnahme, keine Abhängigkeit von einem Caller-beeinflussbaren `created_at`. Ein fehlerhafter Service-Role-Caller kann also keine neuen NULL-Jobs mehr erzeugen.
- BEFORE UPDATE: Die Pre-G3.1-Ausnahme (`NULL → Wert`, einmalig) gilt ausschließlich für bereits existierende Zeilen mit `OLD.created_at < deployment_ts`. `Wert → anderer Wert` bleibt überall verboten; für Post-Stichtag-Zeilen ist `plate_generation` vollständig immutable.
- `created_at` wird für diesen Mechanismus selbst immutable (UPDATE auf `created_at` ⇒ Exception), damit das Zeitfenster nicht nachträglich erschlichen werden kann.
- Langfristig: nach Drain der Altjobs `ALTER TABLE ... ALTER COLUMN plate_generation SET NOT NULL` und Rückbau der temporären Stichtagslogik. Wird als Folgeaufgabe im Bericht vermerkt.
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

Nur die vier Initial-Dispatcher reichen nicht. Jeder neue Provider-Auftrag — auch aus Webhooks, Pollern und Watchdogs — bekommt VOR dem Dispatch eine eigene Zeile: gleiche `scene_id`/`run_id`/`stage`/`plate_generation`, `attempt_no + 1`, neue `pipeline_job_id`, die in die Callback-URL wandert.

### Atomarer Replace-Attempt-Vertrag (verbindlich)

`attempt_no + 1` plus Unique Constraint ist kein vollständiger Vertrag, wenn fünf Quellen konkurrierend Retry auslösen können. Ablösen und Anlegen laufen deshalb in **einer** DB-Transaktion, gekapselt in einem `SECURITY DEFINER`-RPC `composer_replace_pipeline_attempt(previous_job_id, expected_scene_id, expected_run_id, expected_stage, expected_plate_generation, ...)`:

```text
FOR UPDATE auf previous_job_id
  → Identität prüfen (scene/run/stage/generation müssen exakt passen)
  → Ablösefähigkeit prüfen (nicht bereits stale/succeeded/cancelled/abgelöst)
  → previous.status = 'stale' (+ replaced_by, completed_at)
  → INSERT neuer Attempt mit attempt_no + 1, status 'pending'
  → COMMIT, Rückgabe der neuen pipeline_job_id
```

- Der neue `pipeline_job_id` wird **erst nach erfolgreichem Commit** für den Provider-Dispatch verwendet.
- Ein paralleler Ablöseversuch verliert deterministisch (Row Lock + Ablösefähigkeits-Prüfung + Unique Constraint auf `(scene_id, run_id, stage, segment_id, attempt_no)`) und erzeugt keinen zweiten aktiven Attempt; der Verlierer bricht den eigenen Retry ab, statt zu dispatchen.
- Der Zwischenzustand „alter Attempt stale, neuer Insert fehlgeschlagen" ist ausgeschlossen: Fehler beim INSERT rollt die Terminalisierung mit zurück.
- Kein Scene-State-, Mirror- oder Credit-Write; ausschließlich `composer_pipeline_jobs`.

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
- Kriterium: 0 × `missing_binding`, 0 × `job_not_found` und 0 × `wrong_job` für Dispatches nach dem Deploy-Zeitstempel. `wrong_job` bedeutet eine fehlerhafte Job-Bindung und muss vor G3.2 untersucht werden.
- `stale_run` / `stale_generation` entstehen durch legitime Run-Wechsel und werden nur berichtet, nicht als Gate-Verletzung gewertet.
- `binding_pending` wird gezählt und berichtet, blockiert G3.1 nicht, entscheidet aber mit über den G3.2-Vertrag.
- Ältere in-flight-Callbacks werden über den Deploy-Zeitstempel herausgefiltert.
- Messung: Auswertung der `[v431] g31_observe`-Logzeilen je Handler plus Gegenprobe in `composer_pipeline_jobs` (Anteil Post-Deploy-Runs mit Ledger-Zeile je Stage).

## Reihenfolge

1. Migration: INSERT-Pflicht ohne `created_at`-Bypass, `created_at` immutable, volle Immutabilität für `plate_generation`, Reaper auf `dispatch_uncertain`, RPC `composer_replace_pipeline_attempt`.
2. `settleLedgerDispatchFailure()` mit `rejected`/`uncertain` und `binding_pending`-Verdikt im Shared-Modul; Helper `replaceLedgerAttempt()` als einziger Retry-Einstieg.
3. Verdrahtung Initial-Dispatcher (`compose-video-clips`, `compose-dialog-segments`, `render-sync-segments-audio-mux`, `sync-so-webhook`) + alle Retry-Dispatcher aus dem Inventar über `replaceLedgerAttempt()`.
4. DB-Smokes (INSERT-Pflicht auch bei manipuliertem `created_at`, Immutabilität, `failed` vs. `dispatch_uncertain`, Reaper terminalisiert nicht, atomarer Replace inkl. Rollback bei INSERT-Fehler, konkurrierender Replace verliert deterministisch) + Guard-Tests (Observe read-only).
5. Deploy → Drain-Fenster → Bericht in `docs/v431-g3-1-report.md`. STOP; kein G3.2.
