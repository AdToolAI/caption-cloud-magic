# v431 G3.1 — Produktionslauf + Drain-Beobachtung

Kein Code-Change, keine Migration, kein G3.2. Nur: echten Lauf auslösen, beobachten, Bericht aktualisieren, STOP.

T0 = 2026-08-15T09:05:17Z · Frühester Fensterschluss = 2026-08-15T10:05:17Z (12:05:17 CEST)

## 1. Realen Lauf auslösen

Motion Studio wird über den Browser (Playwright, angemeldete Session, localhost-Preview) wie ein normaler Nutzer bedient:
Szene mit Dialog/Sprecher anlegen bzw. bestehende Szene neu starten → Lip-Sync-Lauf starten.
Ziel-Kette: Base Video (Replicate) → compose-clip-webhook → Sync.so Segment → sync-so-webhook → Audio-Mux → Remotion → remotion-webhook.

Keine DB-Manipulation, keine simulierten Callbacks. Der Lauf muss nach T0 starten.

Hinweis: Der Lauf verbraucht echte Provider- und Credit-Kosten auf dem verwendeten Konto.

## 2. Laufidentität festhalten

Aus `composer_scenes` und `composer_pipeline_jobs` lesen (read-only):
scene_id, active_run_id, plate_generation, Startzeit sowie je Ledger-Job: id, stage, segment_id, attempt_no, external_job_id, status.
Explizit prüfen: `plate_generation` ist auf allen neuen Ledger-Zeilen gesetzt.

## 3. Kanalnachweis

Vier Kanäle einzeln ausweisen: Replicate/Base Video, Sync.so Segment, Audio-Mux-Dispatch, Remotion.
Kanal ohne echten Post-T0-Dispatch/Callback = `not_observed`, nicht PASS.

## 4. Observe-Telemetrie

Nur Post-T0-Einträge mit Tag `[v431] g31_observe` je Kanal auszählen.
Harte Gates: missing_binding = 0, job_not_found = 0, wrong_job = 0.
Separat: binding_pending (mit Job/Kanal benannt), stale_run, stale_generation, observe_error, sonstige.

## 5. Ledger-Gegenprobe

Direkt gegen `composer_pipeline_jobs` prüfen: Ledger-Job je Dispatch vorhanden, Callback-`pipeline_job_id` trifft genau diesen Job, Identitätsfelder stimmen, keine unerwarteten parallel aktiven Attempts derselben Identität, kein Initial-Acquire mit attempt_no > 1. Retries nur über den Replace-Vertrag (Vorgänger stale/replaced_by, attempt_no+1).

## 6. Boot-/Runtime-Nachweis

Für jede im Lauf tatsächlich aufgerufene Function die Post-Deploy-Logs auf Import-/Boot-/Runtime-Fehler prüfen. Fehlende Logs zählen nicht als „boot clean“.

## 7. Bericht

`docs/v431-g3-1-drain.md` ergänzen: Laufidentität, Kanaltabelle, Ledger-Job-Tabelle, Observe-Verdikte je Kanal, Attempt-Verteilung, Abweichungen, Zeitstempel des letzten geprüften Events.

## 8. Zeit-Gate & Abschluss

Ist 10:05:17Z bei Abschluss der Analyse noch nicht erreicht: Status `G3.1 DEPLOYED / DRAINING`, STOP. Nach Fensterablauf wird das gesamte Post-T0-Fenster erneut gegen die drei Null-Gates geprüft.

Zeigt der Lauf einen Defekt: Befund dokumentieren und STOP — keine Reparatur.

## Technische Details

- Beobachtung: `supabase--read_query` (Ledger, Szenen), `supabase--edge_function_logs` und `supabase--analytics_query` (function_edge_logs) für die Verdikte.
- Nur schreibender Vorgang im gesamten Auftrag: `docs/v431-g3-1-drain.md`.
