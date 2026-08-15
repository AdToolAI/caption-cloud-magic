# v431 G3.1 — Produktionslauf #2 im Drain-Fenster

Kein Code-Change, keine Migration, keine Konfigurationsänderung, kein G3.2. Nur: echten UI-Lauf starten, vier Kanäle beobachten, Ledger-Gegenprobe, Bericht, STOP.

```text
T0 (Rollout G3.1d) = 2026-08-15T10:47:35Z
Fensterende        = 2026-08-15T11:47:35Z
G3.2 LOCKED
```

## 1. Lauf auslösen

Bewusst einfacher Fall über die angemeldete Preview (Playwright, normaler Nutzerpfad): eine Szene mit genau einem Sprecher und kurzem Dialog, sodass keine `tight_grid`-Retry-Bedingung entsteht. Keine DB-Manipulation, keine simulierten Callbacks. Startzeitpunkt muss nach T0 liegen.

Zielkette: Base Video (Replicate) → `compose-clip-webhook` → Sync.so-Segment → `sync-so-webhook` → Audio-Mux → Remotion → `remotion-webhook`.

Hinweis: echter Provider- und Credit-Verbrauch auf dem verwendeten Konto.

## 2. Laufidentität festhalten

Read-only aus `composer_scenes` und `composer_pipeline_jobs`: scene_id, active_run_id, plate_generation, Startzeit; je Ledger-Job id, stage, segment_id, attempt_no, external_job_id, status. Prüfen, dass `plate_generation` auf allen neuen Ledger-Zeilen gesetzt ist.

## 3. Kanalnachweis (vier Kanäle einzeln)

Replicate/Base-Video, Sync.so, Audio-Mux, Remotion. Kanal ohne echten Post-T0-Dispatch/Callback = `not_observed`, nicht PASS.

## 4. Telemetrie-Auswertung

Maßgebliche Beweisquelle ist `composer_callback_observations` (persistent, append-only), nicht mehr die kurzlebigen Function-Logs.

- Harte Gates für Post-T0-Jobs: `missing_binding = 0`, `job_not_found = 0`, `wrong_job = 0`.
- `binding_pending` wird gezählt und je Job/Kanal benannt.
- `stale_run` / `stale_generation` rein diagnostisch, jeweils auf legitimen Run-/Generation-Wechsel zurückführen.
- Sonstige Verdikte (`observe_error` u. a.) separat ausweisen.

## 5. Ledger-Gegenprobe

Gegen `composer_pipeline_jobs`: je Dispatch ein Ledger-Job vorhanden; Callback-`pipeline_job_id` trifft genau diesen Job; Identitätsfelder stimmen; keine unerwarteten parallel aktiven Attempts derselben Identität; kein Initial-Acquire mit `attempt_no > 1`; Retries nur über den Replace-Vertrag (Vorgänger `stale`/`replaced_by`, attempt_no+1). Zusätzlich Reaper-Heartbeats im Fenster auf `ok = true` prüfen.

## 6. Fehlerfall A

Scheitert der Lauf erneut vor dem ersten Provider-Callback mit `watchdog_no_prediction_id`: Befund dokumentieren, A als echten Blocker für einen erfolgreichen Drain-Lauf markieren, STOP — keine Reparatur.

## 7. Fenster-Abschluss

Ist der Lauf vor 11:47:35Z fertig: G3.1 bleibt `DEPLOYED / DRAINING`. Danach bis Fensterende weiter beobachten und anschließend das gesamte Post-T0-Fenster gegen die drei Null-Gates auswerten. Erst dann Abnahmeentscheidung, G3.2 weiterhin gesperrt.

## 8. Bericht

`docs/v431-g3-1-drain.md` fortschreiben: Laufidentität, Kanaltabelle, Ledger-Job-Tabelle, Verdikt-Zählung je Kanal aus `composer_callback_observations`, Attempt-Verteilung, Abweichungen, Zeitstempel des letzten geprüften Events.

## Technische Details

- Beobachtung: `supabase--read_query` (Observations, Ledger, Szenen, Heartbeats), `supabase--edge_function_logs` nur ergänzend.
- Einziger Schreibvorgang im Auftrag: `docs/v431-g3-1-drain.md`.
