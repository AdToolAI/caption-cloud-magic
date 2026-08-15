# v431 G3.1f — Recovery/Re-Injection Provenance Fix

Enger Transport-Fix für genau die drei in G3.1e bestätigten Re-Injection-Pfade. Kein G3.2-Apply-Umbau, keine neue Provenienz-SoT, keine Änderung an Lip-Sync-Geometrie oder Providerlogik. G3.2.2 bleibt BLOCKED.

## Pfad-Analyse (verifiziert)

| Pfad | Externe Job-ID persistiert in | `pipeline_job_id` beim Dispatch verfügbar | Pointer-Slot | Leser |
| --- | --- | --- | --- | --- |
| Sync.so | `dialog_shots.passes[i].job_id` (`compose-dialog-segments`, gesetzt direkt vor `bindLedgerExternalJob`) | `v431SyncLedgerJob.id` (dieselbe Codestelle) | `dialog_shots.passes[i].pipeline_job_id` | `lipsync-watchdog` (liest heute schon `p.job_id` an beiden `pollAndForward`-Aufrufstellen) |
| Base Video (Replicate) | `composer_scenes.replicate_prediction_id` | `ledgerJobId` in `compose-video-clips` (Stelle mit `bindLedgerExternalJob`) | neue Spalte `composer_scenes.plate_pipeline_job_id` | `recover-stuck-composer-clip` (`replayWebhook`) |
| Base Video (ModelArk) | `composer_scenes.replicate_prediction_id` mit `modelark:`-Prefix | derselbe `ledgerJobId` | dieselbe Spalte `plate_pipeline_job_id` | `modelark-poll` (`notifyWebhook`) |

Beide Base-Video-Forwarder lesen bereits `replicate_prediction_id` von der Szene — sie bekommen deshalb **einen** gemeinsamen Pointer, keine zweite Metadatenquelle.

## Vertrag (verbindlich)

- `composer_pipeline_jobs` bleibt alleinige autoritative Quelle. Der gespeicherte Wert ist ausschließlich ein **immutable transport pointer**.
- Der Pointer wird nur beim ursprünglichen Dispatch geschrieben, in derselben Operation wie die Bindung der externen Job-ID. Kein Forwarder, kein Webhook, kein Reaper schreibt ihn.
- Recovery-/Poll-Forwarder erzeugen keine Ledger-Identität und keinen neuen Attempt; sie reichen den gelesenen Wert unverändert in URL bzw. Body weiter.
- Der empfangende Webhook behält seine bestehende Ledger-/Run-/Generation-Prüfung unverändert. **Kein** Fallback auf `external_job_id + scene_id + stage`.
- Fehlender Pointer: kein erfundener Wert, kein Ledger-Insert, keine Verhaltensänderung des Recovery-Pfads — nur strukturierte Telemetrie `reinject_missing_pipeline_job_id` (Felder: `function`, `scene_id`, `stage`, `external_job_id`, `run_id`, `generation`) und Weiterlauf wie bisher.
- Falscher/staler Pointer wird vom bestehenden Webhook-Guard abgewiesen (`wrong_job` / `stale_run` / `stale_generation`), nicht repariert.

## Umsetzung

1. **Migration:** Spalte `composer_scenes.plate_pipeline_job_id uuid null` (reiner Pointer, keine FK-Kaskade, kein Default). Kein Backfill für Alt-Szenen — dort greift die `reinject_missing_pipeline_job_id`-Telemetrie.
2. **`compose-video-clips`:** an der Dispatch-Bindung (`bindLedgerExternalJob`) den Pointer zusammen mit `replicate_prediction_id` schreiben — für Replicate und für den ModelArk-Zweig. Beim Start eines neuen Attempts wird der Pointer mitüberschrieben (er gehört zur aktuellen `plate_generation`); wird kein Ledger-Job dispatcht, wird er auf `null` gesetzt statt einen alten Wert stehen zu lassen.
3. **`recover-stuck-composer-clip`:** Szene-Select um `plate_pipeline_job_id` erweitern, `replayWebhook` hängt `&pipeline_job_id=…` an die bestehende URL; ohne Pointer nur Telemetrie.
4. **`modelark-poll`:** Szene-Select um `plate_pipeline_job_id` erweitern, `notifyWebhook` hängt `&pipeline_job_id=…` an die bestehende URL (neben `run_id`/`generation`); ohne Pointer nur Telemetrie.
5. **`compose-dialog-segments`:** an der Stelle `pass.job_id = jobId` zusätzlich `pass.pipeline_job_id = v431SyncLedgerJob.id` in den Pass-Snapshot schreiben. `run_id`, `plate_generation` und die Provider-`job_id` bleiben unverändert und werden nicht überschreibbar; der Pointer wird nur gesetzt, wenn er für diesen Pass noch nicht existiert oder der Pass gerade neu dispatcht wird.
6. **`lipsync-watchdog`:** an beiden `pollAndForward`-Aufrufstellen (reguläre `rendering`-Passes und der 201-Probe-Zweig) `pipelineJobId: p.pipeline_job_id` mitgeben; `pollAndForward` hängt es an die `sync-so-webhook`-URL. Auswahl-, Poll- und Recovery-Logik bleiben unverändert.

## Tests

- Neue Unit-/Fixture-Tests: Watchdog-Forward-URL enthält denselben Pointer wie der reguläre Dispatch; `recover`-Replay und `modelark-poll`-Forward tragen die Plate-Pointer-ID; fehlender Pointer → genau ein `reinject_missing_pipeline_job_id`-Event, keine URL-Injektion, kein Abbruch.
- Guard-Test: manipulierter/staler Pointer wird vom bestehenden Webhook-Guard abgewiesen; kein Fallback-Resolve.
- Invarianz: keine neue Ledger-Zeile und kein neuer Attempt durch Re-Injection; Retry-/Acquire-Verträge aus G3.1 unverändert (bestehende Suites).
- Frozen-Suite, `tsgo`, `deno check` für die vier berührten Functions.
- `composer_callback_observations` nach den gezielten Re-Injection-Tests: `missing_binding = 0`.

## Abschluss

Bericht `docs/v431-g3-1f-report.md` (Pfadtabelle, Vertragsnachweis, Testmatrix, Telemetrie-Auszug), danach **STOP**. Kein Deploy, kein G3.2.2 — der gezielte Watchdog-Forward-Resmoke wird separat freigegeben.
