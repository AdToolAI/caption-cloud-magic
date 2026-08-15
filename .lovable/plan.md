# v431 G3.1b — Replicate-Kanal, Dispatch-Failure-Vertrag, Abnahme-Nachweise

## Klarstellung vorab: der Replicate-Kanal ist bereits verdrahtet

Der Kanal fehlte in meiner Zusammenfassung, nicht im Code. Verifiziert im aktuellen Stand:

- `compose-video-clips`: Ledger-Zeile wird VOR dem Provider-Dispatch je Szene angelegt (`stage: base_video`, `plateGeneration` aus dem Run-Stempel eingefroren), die `pipeline_job_id` hängt in der Replicate-Webhook-URL (`sceneWebhookUrl()`), nach dem Dispatch wird die Prediction-ID gebunden.
- `compose-clip-webhook`: `observeCallbackProvenance()` läuft mit `stage: 'base_video'`, `pipelineJobId` aus der URL und `reportedRunId` — vor jeder Statusverarbeitung, ohne Verhaltensänderung.

Damit sind alle vier G3-Callback-Kanäle messbar: Replicate/Plate, Sync.so, Audio-Mux-Dispatch, Remotion.

## Nachweis 1 — Ledger-Schema (verifiziert, ein Restpunkt)

`composer_pipeline_jobs` hat `plate_generation`. Trigger `composer_pipeline_jobs_identity_guard` (BEFORE UPDATE) wirft bei jeder Änderung von `scene_id`, `run_id`, `stage`, `attempt_no`, `segment_id` und bei `external_job_id`, sobald einmal gesetzt. Zusätzlich: `UNIQUE NULLS NOT DISTINCT (scene_id, run_id, stage, segment_id, attempt_no)`.

Restpunkt: `plate_generation` ist heute nur „Wert → anderer Wert" gesperrt; `NULL → Wert` bleibt für in-flight-Backfill offen. Vorschlag: eine Migration, die `NULL → Wert` nur noch für Zeilen zulässt, die vor dem G3.1-Stichtag erzeugt wurden, und für alle neuen Zeilen hart sperrt. Wird durch DB-Smoke belegt (Update-Versuche auf allen sechs Feldern müssen fehlschlagen).

## Nachweis 2 — Dispatch-Failure ist heute die echte Lücke

Bestätigt: die Zeile entsteht vor dem Provider-Call und wird nur im Erfolgsfall über `bindLedgerExternalJob()` auf `dispatched` gehoben. Scheitert der Dispatch, bleibt sie dauerhaft auf `dispatching` stehen — genau die fälschlich „aktive" Zeile, die du ausschließt. Betroffen: `compose-video-clips` (Szene wirft), `compose-dialog-segments` (jeder Fehler-Return nach der Akquise), `render-sync-segments-audio-mux` (Lambda-Invoke schlägt fehl), `sync-so-webhook` (Mux-Dispatch-Fetch schlägt fehl).

Umsetzung:

- Neuer Ledger-Helper `settleLedgerDispatchFailure(admin, jobId, { errorCode, uncertain })`:
  - Provider hat nachweislich nicht angenommen → `status = 'failed'`, `error_code`, `completed_at = now()`.
  - Dispatch-Ausgang unklar (Timeout, abgebrochener Fetch, unbekannte Provider-Antwort) → `status = 'dispatch_uncertain'` statt `failed`, damit ein später doch eintreffender Callback nicht gegen eine als terminal deklarierte Zeile läuft.
  - Wirkt nur aus `pending`/`dispatching`; niemals über `dispatched`/`succeeded` hinweg. Verletzt keine Immutabilität (Status ist nicht identitätsgebunden).
- Verdrahtung in allen vier Dispatchern: jeder Fehler-Return und jeder Catch-Zweig nach der Akquise ruft den Helper.
- Reaper: `dispatching`-Zeilen älter als 10 Minuten ohne `external_job_id` werden per Cron auf `stale` gesetzt (Sicherheitsnetz für Function-Kills, die keinen Catch mehr erreichen).
- Kein Credit-, State- oder Mirror-Effekt: der Helper fasst ausschließlich `composer_pipeline_jobs` an.

## Nachweis 3 — Observe ist read-only (verifiziert)

`observeCallbackProvenance()` führt ausschließlich `select` aus (Ledger-Zeile, danach `composer_scenes.active_run_id/plate_generation`) und gibt das Urteil über `console.log` aus. Kein `update`, kein `rpc`, kein Insert. Alle Verdikte — `missing_binding`, `job_not_found`, `wrong_job`, `stale_run`, `stale_generation`, `observe_error` — sind reine Telemetrie; kein Handler wertet den Rückgabewert aus. Zur Absicherung gegen künftige Regression: ein Guard-Test, der das Modul auf Schreibaufrufe prüft, und ein Test, der belegt, dass kein Handler das Observe-Ergebnis in einen Branch führt.

## Drain-Gate: Messbarkeit ist nicht Erfüllung

- Drain-Fenster startet erst mit dem Deploy dieser Ergänzung (alle vier Kanäle + Failure-Vertrag).
- Kriterium: 0 × `missing_binding` und 0 × `job_not_found` für Dispatches, die nach dem Deploy-Zeitstempel entstanden sind. Ältere in-flight-Callbacks zählen erwartungsgemäß als `missing_binding` und werden über den Deploy-Zeitstempel herausgefiltert.
- Messung: Auswertung der `[v431] g31_observe`-Logzeilen je Handler, plus Gegenprobe in der Tabelle (Anteil der Post-Deploy-Runs mit Ledger-Zeile je Stage).
- G3.1 bleibt bis zum grünen Drain-Bericht offen. G3.2 (Apply) bleibt unangetastet.

## Reihenfolge

1. Migration: `plate_generation`-Immutabilität schließen (Stichtag), Reaper-Funktion.
2. `settleLedgerDispatchFailure()` im Shared-Modul.
3. Verdrahtung in `compose-video-clips`, `compose-dialog-segments`, `render-sync-segments-audio-mux`, `sync-so-webhook`.
4. Guard-Tests (Observe read-only) + DB-Smoke (Immutabilität, Failure-Übergänge, Reaper).
5. Bericht in `docs/v431-g3-1-report.md` mit den drei Nachweisen und dem Drain-Fenster-Start. STOP.
